import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();
const acmeEmail = config.require("acmeEmail");
const platformDomain = config.require("platformDomain");

// --- Namespace ---
const ns = new k8s.core.v1.Namespace("cert-manager", {
  metadata: { name: "cert-manager" },
});

// --- cert-manager Helm Chart ---
const certManager = new k8s.helm.v3.Chart("cert-manager", {
  chart: "cert-manager",
  version: "v1.15.3",
  fetchOpts: { repo: "https://charts.jetstack.io" },
  namespace: ns.metadata.name,
  values: {
    installCRDs: true,
    resources: { requests: { memory: "64Mi", cpu: "25m" }, limits: { memory: "128Mi", cpu: "100m" } },
  },
}, { dependsOn: [ns] });

// --- ClusterIssuer: HTTP-01 (for individual custom domains) ---
const letsencryptProd = new k8s.apiextensions.CustomResource("letsencrypt-prod", {
  apiVersion: "cert-manager.io/v1",
  kind: "ClusterIssuer",
  metadata: { name: "letsencrypt-prod" },
  spec: {
    acme: {
      server: "https://acme-v02.api.letsencrypt.org/directory",
      email: acmeEmail,
      privateKeySecretRef: { name: "letsencrypt-prod-account-key" },
      solvers: [{ http01: { ingress: { ingressClassName: "traefik" } } }],
    },
  },
}, { dependsOn: [certManager] });

// --- ClusterIssuer: DNS-01 (for wildcard certs via Hostinger webhook) ---
const letsencryptDns = new k8s.apiextensions.CustomResource("letsencrypt-dns", {
  apiVersion: "cert-manager.io/v1",
  kind: "ClusterIssuer",
  metadata: { name: "letsencrypt-dns" },
  spec: {
    acme: {
      email: acmeEmail,
      server: "https://acme-v02.api.letsencrypt.org/directory",
      privateKeySecretRef: { name: "letsencrypt-dns-account-key" },
      solvers: [{
        dns01: {
          webhook: {
            groupName: `acme.${platformDomain}`,
            solverName: "hostinger",
            config: { zoneDomain: platformDomain, ttl: 60 },
          },
        },
      }],
    },
  },
}, { dependsOn: [certManager] });

// --- Exports ---
export const namespace = ns.metadata.name;
export const httpIssuerName = letsencryptProd.metadata.name;
export const dnsIssuerName = letsencryptDns.metadata.name;
