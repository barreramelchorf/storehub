import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface HelmReleasesArgs {
  namespace: pulumi.Input<string>;
  postgresPassword: pulumi.Input<string>;
  redisPassword: pulumi.Input<string>;
  minioRootPassword: pulumi.Input<string>;
}

export function createHelmReleases(args: HelmReleasesArgs) {
  const postgresql = new k8s.helm.v3.Release("postgresql", {
    chart: "postgresql",
    version: "16.2.1",
    repositoryOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.namespace,
    values: {
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

  const redis = new k8s.helm.v3.Release("redis", {
    chart: "redis",
    version: "20.3.0",
    repositoryOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.namespace,
    values: {
      auth: { password: args.redisPassword },
      architecture: "standalone",
      master: {
        persistence: { size: "1Gi" },
        resources: { requests: { memory: "64Mi", cpu: "50m" }, limits: { memory: "128Mi", cpu: "200m" } },
      },
    },
  });

  const minio = new k8s.helm.v3.Release("minio", {
    chart: "minio",
    version: "14.8.3",
    repositoryOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.namespace,
    values: {
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
