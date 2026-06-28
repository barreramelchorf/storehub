import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface AppResourcesArgs {
  namespace: pulumi.Input<string>;
  apiImage: string;
  webImage: string;
  migrateImage: string;
  apiReplicas: number;
  webReplicas: number;
  platformDomain: string;
  databaseUrl: pulumi.Input<string>;
  redisUrl: pulumi.Input<string>;
  jwtSecret: pulumi.Input<string>;
  minioEndpoint: pulumi.Input<string>;
  minioAccessKey: pulumi.Input<string>;
  minioSecretKey: pulumi.Input<string>;
  tlsSecretName?: string; // Only set in prod
  ghcrToken: pulumi.Input<string>;
}

export function createAppResources(args: AppResourcesArgs) {
  // --- Image Pull Secret (ghcr.io) ---
  const ghcrSecret = new k8s.core.v1.Secret("ghcr-secret", {
    metadata: { namespace: args.namespace, name: "ghcr-secret" },
    type: "kubernetes.io/dockerconfigjson",
    stringData: {
      ".dockerconfigjson": pulumi.interpolate`{"auths":{"ghcr.io":{"username":"barreramelchorf","password":"${args.ghcrToken}"}}}`,
    },
  });

  // --- Secrets ---
  const appSecret = new k8s.core.v1.Secret("app-secrets", {
    metadata: { namespace: args.namespace },
    stringData: {
      DATABASE_URL: args.databaseUrl,
      REDIS_URL: args.redisUrl,
      JWT_SECRET: args.jwtSecret,
      MINIO_ACCESS_KEY: args.minioAccessKey,
      MINIO_SECRET_KEY: args.minioSecretKey,
    },
  });

  // --- ConfigMap ---
  const appConfig = new k8s.core.v1.ConfigMap("app-config", {
    metadata: { namespace: args.namespace },
    data: {
      PLATFORM_DOMAIN: args.platformDomain,
      MINIO_ENDPOINT: args.minioEndpoint,
      MINIO_PORT: "9000",
      MINIO_BUCKET: "storehub",
      MINIO_USE_SSL: "false",
      LOG_LEVEL: "info",
      PORT: "3001",
    },
  });

  const envFrom = [
    { secretRef: { name: appSecret.metadata.name } },
    { configMapRef: { name: appConfig.metadata.name } },
  ];

  // --- Migration Job ---
  const migrateJob = new k8s.batch.v1.Job("db-migrate", {
    metadata: { namespace: args.namespace },
    spec: {
      backoffLimit: 5,
      template: {
        spec: {
          restartPolicy: "OnFailure",
          initContainers: [{
            name: "wait-for-postgres",
            image: "busybox:1.36",
            command: ["sh", "-c", `until nc -z postgresql.storehub-data-dev.svc.cluster.local 5432; do echo 'waiting for postgres...'; sleep 3; done`],
          }],
          containers: [{
            name: "migrate",
            image: args.migrateImage,
            envFrom,
            env: [{ name: "RUN_SEED", value: pulumi.getStack() !== "prod" ? "true" : "false" }],
          }],
          imagePullSecrets: [{ name: "ghcr-secret" }],
        },
      },
    },
  });

  // --- API Deployment ---
  const apiLabels = { app: "storehub-api" };
  const apiDeployment = new k8s.apps.v1.Deployment("api", {
    metadata: { namespace: args.namespace },
    spec: {
      replicas: args.apiReplicas,
      selector: { matchLabels: apiLabels },
      template: {
        metadata: { labels: apiLabels },
        spec: {
          serviceAccountName: "storehub-api",
          containers: [{
            name: "api",
            image: args.apiImage,
            ports: [{ containerPort: 3001 }],
            envFrom,
            livenessProbe: { httpGet: { path: "/health", port: 3001 }, initialDelaySeconds: 10, periodSeconds: 30 },
            readinessProbe: { httpGet: { path: "/health", port: 3001 }, initialDelaySeconds: 5, periodSeconds: 10 },
            resources: { requests: { memory: "128Mi", cpu: "100m" }, limits: { memory: "256Mi", cpu: "500m" } },
          }],
          imagePullSecrets: [{ name: "ghcr-secret" }],
        },
      },
    },
  }, { dependsOn: [migrateJob] });

  const apiService = new k8s.core.v1.Service("api-svc", {
    metadata: { namespace: args.namespace },
    spec: {
      selector: apiLabels,
      ports: [{ port: 3001, targetPort: 3001 }],
    },
  });

  // --- Web Deployment ---
  const webLabels = { app: "storehub-web" };
  const webDeployment = new k8s.apps.v1.Deployment("web", {
    metadata: { namespace: args.namespace },
    spec: {
      replicas: args.webReplicas,
      selector: { matchLabels: webLabels },
      template: {
        metadata: { labels: webLabels },
        spec: {
          containers: [{
            name: "web",
            image: args.webImage,
            ports: [{ containerPort: 3000 }],
            env: [
              { name: "API_URL", value: pulumi.interpolate`http://${apiService.metadata.name}:3001` },
              { name: "NEXT_PUBLIC_API_URL", value: `/api` },
              { name: "HOSTNAME", value: "0.0.0.0" },
            ],
            livenessProbe: { httpGet: { path: "/admin/login", port: 3000 }, initialDelaySeconds: 15, periodSeconds: 30 },
            readinessProbe: { httpGet: { path: "/admin/login", port: 3000 }, initialDelaySeconds: 10, periodSeconds: 10 },
            resources: { requests: { memory: "128Mi", cpu: "100m" }, limits: { memory: "256Mi", cpu: "500m" } },
          }],
          imagePullSecrets: [{ name: "ghcr-secret" }],
        },
      },
    },
  });

  const webService = new k8s.core.v1.Service("web-svc", {
    metadata: { namespace: args.namespace },
    spec: {
      selector: webLabels,
      ports: [{ port: 3000, targetPort: 3000 }],
    },
  });

  // --- Traefik IngressRoute (wildcard subdomains) ---
  const tlsConfig = args.tlsSecretName
    ? { secretName: args.tlsSecretName }
    : {};

  const ingressRoute = new k8s.apiextensions.CustomResource("ingress-route", {
    apiVersion: "traefik.io/v1alpha1",
    kind: "IngressRoute",
    metadata: { namespace: args.namespace },
    spec: {
      entryPoints: ["websecure"],
      routes: [
        {
          match: `HostRegexp(\`{subdomain:[a-z0-9-]+}.${args.platformDomain}\`)`,
          kind: "Rule",
          services: [{ name: webService.metadata.name, port: 3000 }],
        },
        {
          match: `HostRegexp(\`{subdomain:[a-z0-9-]+}.${args.platformDomain}\`) && PathPrefix(\`/api\`)`,
          kind: "Rule",
          priority: 100,
          services: [{ name: apiService.metadata.name, port: 3001 }],
        },
      ],
      ...(args.tlsSecretName && { tls: { secretName: args.tlsSecretName } }),
    },
  });

  // --- ServiceAccount + RBAC for API to create Ingresses dynamically (custom domains) ---
  const sa = new k8s.core.v1.ServiceAccount("storehub-api", {
    metadata: { name: "storehub-api", namespace: args.namespace },
  });

  const role = new k8s.rbac.v1.Role("api-ingress-manager", {
    metadata: { namespace: args.namespace },
    rules: [{
      apiGroups: ["networking.k8s.io"],
      resources: ["ingresses"],
      verbs: ["get", "list", "create", "update", "delete"],
    }],
  });

  const roleBinding = new k8s.rbac.v1.RoleBinding("api-ingress-manager-binding", {
    metadata: { namespace: args.namespace },
    subjects: [{ kind: "ServiceAccount", name: sa.metadata.name, namespace: args.namespace }],
    roleRef: { kind: "Role", name: role.metadata.name, apiGroup: "rbac.authorization.k8s.io" },
  });

  // --- HPA for API ---
  const apiHpa = new k8s.autoscaling.v2.HorizontalPodAutoscaler("api-hpa", {
    metadata: { namespace: args.namespace },
    spec: {
      scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name: apiDeployment.metadata.name },
      minReplicas: args.apiReplicas,
      maxReplicas: Math.max(args.apiReplicas * 3, 3),
      metrics: [{ type: "Resource", resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 70 } } }],
    },
  });

  return { apiDeployment, apiService, webDeployment, webService, ingressRoute, migrateJob, apiHpa };
}
