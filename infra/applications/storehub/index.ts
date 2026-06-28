import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { createHelmReleases } from "./helm";
import { createAppResources } from "./kubernetes";

const config = new pulumi.Config();
const stack = pulumi.getStack();

// --- Config ---
const platformDomain = config.require("platformDomain");
const version = config.require("version");
const migrationsVersion = config.require("migrationsVersion");
const apiReplicas = config.getNumber("apiReplicas") ?? 1;
const webReplicas = config.getNumber("webReplicas") ?? 1;

// Image refs built from version tags
const apiImage = `ghcr.io/barreramelchorf/storehub-api:${version}`;
const webImage = `ghcr.io/barreramelchorf/storehub-web:${version}`;
const migrateImage = `ghcr.io/barreramelchorf/storehub-migrate:${migrationsVersion}`;

// --- Secrets ---
const postgresPassword = config.requireSecret("postgresPassword");
const redisPassword = config.requireSecret("redisPassword");
const jwtSecret = config.requireSecret("jwtSecret");
const minioRootPassword = config.requireSecret("minioRootPassword");
const ghcrToken = config.requireSecret("ghcrToken");

// --- Namespaces ---
const dataNs = new k8s.core.v1.Namespace("data", {
  metadata: { name: `storehub-data-${stack}` },
});

const platformNs = new k8s.core.v1.Namespace("platform", {
  metadata: { name: `storehub-${stack}` },
});

// --- Helm Charts (app-owned: postgres, redis, minio) ---
const helm = createHelmReleases({
  dataNamespace: dataNs.metadata.name,
  postgresPassword,
  redisPassword,
  minioRootPassword,
});

// Certs issued per-host via HTTP-01 (cert-manager annotation on Ingress)
// Wildcard not possible without DNS-01 webhook for Hostinger

// --- Connection strings ---
const databaseUrl = pulumi.interpolate`postgres://postgres:${postgresPassword}@postgresql.${dataNs.metadata.name}.svc.cluster.local:5432/storehub`;
const redisUrl = pulumi.interpolate`redis://:${redisPassword}@redis-master.${dataNs.metadata.name}.svc.cluster.local:6379`;
const minioEndpoint = pulumi.interpolate`minio.${dataNs.metadata.name}.svc.cluster.local`;

// --- App Resources ---
const app = createAppResources({
  namespace: platformNs.metadata.name,
  dataNamespace: dataNs.metadata.name,
  apiImage, webImage, migrateImage,
  apiReplicas, webReplicas, platformDomain,
  databaseUrl, redisUrl, jwtSecret,
  minioEndpoint, minioAccessKey: "storehub", minioSecretKey: minioRootPassword,
  tlsSecretName: stack === "prod" ? "wildcard-tls" : undefined,
  ghcrToken,
  nextPublicApiUrl: config.get("nextPublicApiUrl") ?? "",
});

// --- Exports ---
export const apiServiceName = app.apiService.metadata.name;
export const webServiceName = app.webService.metadata.name;
export const platformNamespace = platformNs.metadata.name;
export const dataNamespace = dataNs.metadata.name;
