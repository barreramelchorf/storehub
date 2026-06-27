import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface HelmReleasesArgs {
  dataNamespace: pulumi.Input<string>;
  postgresPassword: pulumi.Input<string>;
  redisPassword: pulumi.Input<string>;
  minioRootPassword: pulumi.Input<string>;
}

export function createHelmReleases(args: HelmReleasesArgs) {
  const postgresql = new k8s.helm.v3.Chart("postgresql", {
    chart: "postgresql",
    version: "16.2.1",
    fetchOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.dataNamespace,
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

  const redis = new k8s.helm.v3.Chart("redis", {
    chart: "redis",
    version: "20.3.0",
    fetchOpts: { repo: "https://charts.bitnami.com/bitnami" },
    namespace: args.dataNamespace,
    values: {
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
      auth: {
        rootUser: "storehub",
        rootPassword: args.minioRootPassword,
      },
      defaultBuckets: "storehub",
      persistence: { size: "5Gi" },
      resources: { requests: { memory: "128Mi", cpu: "50m" }, limits: { memory: "256Mi", cpu: "200m" } },
    },
  });

  const certManager = new k8s.helm.v3.Chart("cert-manager", {
    chart: "cert-manager",
    version: "1.16.2",
    fetchOpts: { repo: "https://charts.jetstack.io" },
    namespace: "cert-manager",
    values: {
      installCRDs: true,
      resources: { requests: { memory: "64Mi", cpu: "25m" }, limits: { memory: "128Mi", cpu: "100m" } },
    },
    transformations: [(obj: any) => {
      // Ensure cert-manager namespace exists
      if (obj.kind === "Namespace") return;
    }],
  });

  return { postgresql, redis, minio, certManager };
}
