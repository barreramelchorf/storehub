import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { createHelmReleases } from "./helm";
import { createAppResources } from "./k8s";

const config = new pulumi.Config();

// --- Config values ---
const platformDomain = config.require("platformDomain");
const apiImage = config.require("apiImage");
const webImage = config.require("webImage");
const migrateImage = config.require("migrateImage");
const apiReplicas = config.getNumber("apiReplicas") ?? 1;
const webReplicas = config.getNumber("webReplicas") ?? 1;

// --- Secrets ---
const postgresPassword = config.requireSecret("postgresPassword");
const redisPassword = config.requireSecret("redisPassword");
const jwtSecret = config.requireSecret("jwtSecret");
const minioRootPassword = config.requireSecret("minioRootPassword");

// --- Namespaces ---
const dataNs = new k8s.core.v1.Namespace("data", {
  metadata: { name: "data" },
});

const platformNs = new k8s.core.v1.Namespace("platform", {
  metadata: { name: "platform" },
});

const certManagerNs = new k8s.core.v1.Namespace("cert-manager", {
  metadata: { name: "cert-manager" },
});

// --- Helm Charts (data layer + cert-manager) ---
const helm = createHelmReleases({
  dataNamespace: dataNs.metadata.name,
  postgresPassword,
  redisPassword,
  minioRootPassword,
});

// --- Let's Encrypt ClusterIssuers ---
// HTTP-01 for individual custom domains
const letsencryptProd = new k8s.apiextensions.CustomResource("letsencrypt-prod", {
  apiVersion: "cert-manager.io/v1",
  kind: "ClusterIssuer",
  metadata: { name: "letsencrypt-prod" },
  spec: {
    acme: {
      server: "https://acme-v02.api.letsencrypt.org/directory",
      email: config.require("acmeEmail"),
      privateKeySecretRef: { name: "letsencrypt-prod-account-key" },
      solvers: [{ http01: { ingress: { ingressClassName: "traefik" } } }],
    },
  },
}, { dependsOn: [helm.certManager] });

// DNS-01 for wildcard platform subdomain (uses existing Hostinger webhook)
const letsencryptDns = new k8s.apiextensions.CustomResource("letsencrypt-dns", {
  apiVersion: "cert-manager.io/v1",
  kind: "ClusterIssuer",
  metadata: { name: "letsencrypt-dns" },
  spec: {
    acme: {
      email: config.require("acmeEmail"),
      server: "https://acme-v02.api.letsencrypt.org/directory",
      privateKeySecretRef: { name: "letsencrypt-dns-account-key" },
      solvers: [{
        dns01: {
          webhook: {
            groupName: `acme.${platformDomain}`,
            solverName: "hostinger",
            config: {
              zoneDomain: platformDomain,
              ttl: 60,
            },
          },
        },
      }],
    },
  },
}, { dependsOn: [helm.certManager] });

// Wildcard cert for platform subdomains
const wildcardCert = new k8s.apiextensions.CustomResource("wildcard-cert", {
  apiVersion: "cert-manager.io/v1",
  kind: "Certificate",
  metadata: { name: `wildcard-${platformDomain.replace(/\./g, "-")}`, namespace: platformNs.metadata.name },
  spec: {
    secretName: "wildcard-tls",
    issuerRef: { name: "letsencrypt-dns", kind: "ClusterIssuer" },
    dnsNames: [platformDomain, `*.${platformDomain}`],
  },
}, { dependsOn: [letsencryptDns] });

// --- Connection strings ---
const databaseUrl = pulumi.interpolate`postgres://postgres:${postgresPassword}@postgresql-primary.${dataNs.metadata.name}.svc.cluster.local:5432/storehub`;
const redisUrl = pulumi.interpolate`redis://:${redisPassword}@redis-master.${dataNs.metadata.name}.svc.cluster.local:6379`;
const minioEndpoint = pulumi.interpolate`minio.${dataNs.metadata.name}.svc.cluster.local`;

// --- App Resources (platform layer) ---
const app = createAppResources({
  namespace: platformNs.metadata.name,
  apiImage,
  webImage,
  migrateImage,
  apiReplicas,
  webReplicas,
  platformDomain,
  databaseUrl,
  redisUrl,
  jwtSecret,
  minioEndpoint,
  minioAccessKey: "storehub",
  minioSecretKey: minioRootPassword,
});

// --- Exports ---
export const apiServiceName = app.apiService.metadata.name;
export const webServiceName = app.webService.metadata.name;
export const platformNamespace = platformNs.metadata.name;
export const dataNamespace = dataNs.metadata.name;
