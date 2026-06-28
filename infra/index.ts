import * as pulumi from "@pulumi/pulumi";
import { deployCertManager } from "./stacks/cert-manager";
import { deployApp } from "./stacks/app";

/**
 * Single Pulumi project, multiple stacks:
 *
 *   pulumi stack select cert-manager && pulumi up   → deploys cert-manager + ClusterIssuers
 *   pulumi stack select dev && pulumi up            → deploys StoreHub app (dev)
 *   pulumi stack select staging && pulumi up        → deploys StoreHub app (staging)
 *   pulumi stack select prod && pulumi up           → deploys StoreHub app (prod)
 *
 * One package.json, one node_modules — no duplication.
 */
const stack = pulumi.getStack();

let outputs: Record<string, any> = {};

if (stack === "cert-manager") {
  const result = deployCertManager();
  outputs = { certManagerNamespace: result.namespace };
} else {
  const result = deployApp();
  outputs = {
    apiServiceName: result.apiServiceName,
    webServiceName: result.webServiceName,
    platformNamespace: result.platformNamespace,
    dataNamespace: result.dataNamespace,
  };
}

// Pulumi picks up top-level exports
module.exports = outputs;
