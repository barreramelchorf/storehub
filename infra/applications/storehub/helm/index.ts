import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface HelmReleasesArgs {
  dataNamespace: pulumi.Input<string>;
  postgresPassword: pulumi.Input<string>;
  redisPassword: pulumi.Input<string>;
  minioRootPassword: pulumi.Input<string>;
}

export function createHelmReleases(args: HelmReleasesArgs) {
  // Bitnami moved free images to bitnamilegacy as of Sept 2025
  // Use per-image registry to avoid double-prefixing
  const imageRegistry = "docker.io";
  const imageRepository = (name: string) => `bitnamilegacy/${name}`;

  const postgresql = new k8s.helm.v3.Chart("postgresql", {
    chart: "postgresql",
    version: "16.2.1",
    fetchOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.dataNamespace,
    values: {
      image: { registry: imageRegistry, repository: imageRepository("postgresql") },
      auth: {
        postgresPassword: args.postgresPassword,
        database: "storehub",
      },
      primary: {
        persistence: { size: "5Gi" },
        resources: { requests: { memory: "256Mi", cpu: "100m" }, limits: { memory: "512Mi", cpu: "500m" } },
      },
    },
  });

  const redis = new k8s.helm.v3.Chart("redis", {
    chart: "redis",
    version: "20.3.0",
    fetchOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.dataNamespace,
    values: {
      image: { registry: imageRegistry, repository: imageRepository("redis") },
      auth: { password: args.redisPassword },
      architecture: "standalone",
      master: {
        persistence: { size: "1Gi" },
        resources: { requests: { memory: "64Mi", cpu: "50m" }, limits: { memory: "128Mi", cpu: "200m" } },
      },
    },
  });

  const minio = new k8s.helm.v3.Chart("minio", {
    chart: "minio",
    version: "14.8.3",
    fetchOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.dataNamespace,
    values: {
      image: { registry: imageRegistry, repository: imageRepository("minio") },
      auth: {
        rootUser: "storehub",
        rootPassword: args.minioRootPassword,
      },
      defaultBuckets: "storehub",
      persistence: { size: "5Gi" },
      resources: { requests: { memory: "128Mi", cpu: "50m" }, limits: { memory: "256Mi", cpu: "200m" } },
    },
  });

  return { postgresql, redis, minio };
}
