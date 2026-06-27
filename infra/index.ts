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

// --- Helm Releases (data layer) ---
const helm = createHelmReleases({
  namespace: dataNs.metadata.name,
  postgresPassword,
  redisPassword,
  minioRootPassword,
});

// --- Connection strings ---
const databaseUrl = pulumi.interpolate`postgres://postgres:${postgresPassword}@postgresql.${dataNs.metadata.name}.svc.cluster.local:5432/storehub`;
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
