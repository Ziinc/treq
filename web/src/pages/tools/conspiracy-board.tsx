import React, { useEffect, useRef, useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import styles from './conspiracy-board.module.css';

// ── Data ─────────────────────────────────────────────────────────────────────

interface Tech {
  id: string;
  label: string;
  emoji: string;
  color: string;
  desc: string;
}

const TECHS: Tech[] = [
  { id: 'k8s',       label: 'Kubernetes', emoji: '☸️',  color: '#326CE5', desc: 'Orchestrates your suffering at scale' },
  { id: 'dns',       label: 'DNS',        emoji: '🌐',  color: '#f59e0b', desc: 'It\'s always DNS' },
  { id: 'redis',     label: 'Redis',      emoji: '🔴',  color: '#dc382d', desc: 'The "just cache it" answer' },
  { id: 'oauth',     label: 'OAuth',      emoji: '🔐',  color: '#6366f1', desc: 'Nobody understands the flow' },
  { id: 'kafka',     label: 'Kafka',      emoji: '📨',  color: '#231f20', desc: 'Events go in, chaos comes out' },
  { id: 'ai',        label: 'AI',         emoji: '🤖',  color: '#10b981', desc: 'Solved everything. Somehow.' },
  { id: 'docker',    label: 'Docker',     emoji: '🐳',  color: '#2496ED', desc: 'Works on my machine' },
  { id: 'terraform', label: 'Terraform',  emoji: '🏗️',  color: '#7B42BC', desc: 'Infra as anxiety' },
];

// ── Theory generation ─────────────────────────────────────────────────────────

type TheoryEntry = { icon: string; text: string; final?: boolean };

const PAIR_THEORIES: Record<string, string[]> = {
  'k8s-dns': [
    'Inter-pod communication failed at 02:14 UTC. Root cause: CoreDNS pod was scheduled on a node with a clock skew of 4 minutes, causing SERVFAIL responses on all internal lookups. Node time sync had been disabled 11 days prior during a routine maintenance window. No alert was configured for clock skew.',
    'DNS resolution for internal services began returning NXDOMAIN at 14:31 UTC. Kubernetes had garbage-collected the corresponding Endpoints object 90 seconds earlier following a rolling restart. The DNS TTL of 30 seconds was not honored by all clients. Impact duration: 8 minutes.',
  ],
  'k8s-redis': [
    'Redis pod was evicted at 03:22 UTC due to node memory pressure. The eviction was not surfaced in the primary alerting channel. Service resumed 47 minutes after initial customer-reported impact. The pod\'s memory request was set to 64Mi against an actual working set of 1.2Gi.',
    'Redis pod OOMKilled at 11:07 UTC. Kubernetes replaced the pod within 12 seconds. The replacement pod started without the pre-loaded key set. Cache hit rate dropped from 94% to 0% for 6 minutes, increasing database query volume by 18x during the recovery window.',
  ],
  'k8s-oauth': [
    'OAuth callback endpoint returned 502 for a 40-second window following a pod rescheduling event at 09:45 UTC. The readiness probe did not cover the /oauth/callback route. 312 in-progress login flows were terminated. Users were not notified; the session was silently invalidated.',
    'Auth service Deployment was scaled to 0 replicas by the HPA at 01:00 UTC due to zero RPS during the off-peak window. A scheduled token refresh job attempted to run at 01:03 UTC. All requests failed with connection refused. 4,200 background token renewals were not retried.',
  ],
  'k8s-kafka': [
    'Kafka consumer group lag reached 4,200,000 messages at 16:20 UTC. HPA scaled consumer replicas from 1 to 3 over a 5-minute window. Lag did not decrease. The bottleneck was identified as a single-partition topic, which cannot be parallelized beyond one consumer. The HPA target metric was messages/second, not lag.',
    'Kafka broker pod was scheduled on a node with 0.5 available CPU cores. The broker startup completed successfully. Under production load, broker request handler idle ratio dropped to 0.2%. Message delivery latency increased to 14 seconds. The pod was not flagged by resource monitoring as the CPU limit was not set.',
  ],
  'k8s-ai': [
    'Inference pod OOMKilled at 14:38 UTC. A replacement pod was scheduled on a node with 8GB available memory, down from the original 16GB allocation. The model continued to serve requests. Automated regression tests did not cover output quality. Degraded responses were served for 6 hours before a customer report triggered investigation.',
    'GPU node was removed from the cluster by the cluster autoscaler at 03:00 UTC, identified as underutilized based on CPU and memory metrics. A model training job in progress on that node was terminated without checkpoint. The autoscaler policy did not account for GPU workloads. Job was restarted manually 4 hours later.',
  ],
  'k8s-docker': [
    'Deployment stalled for 3 hours 17 minutes due to image pull latency on a cold node. Image size: 4.2 GB. Pull policy was set to Always. The node had not previously cached the image. SLA breach threshold of 2 hours was crossed without triggering an alert, as the deployment had not yet transitioned to a failed state.',
    'Rolling update stalled at 1/3 replicas for 47 minutes. The new pod was waiting on an image pull. The image layer was being concurrently pulled by 6 other nodes, saturating the registry egress bandwidth. No timeout was configured on the pod\'s image pull operation.',
  ],
  'k8s-terraform': [
    'Terraform state pod was evicted by Kubernetes at 22:11 UTC during a planned state file write operation. The state file was partially written at the time of eviction. A subsequent terraform plan reported the cluster as partially created. Manual state recovery required 4 hours. The cluster remained operational throughout.',
    'Terraform provider and kubectl reported different replica counts for the same Deployment for 12 minutes following an out-of-band manual scaling operation. Both values were accurate at different points in time. A Terraform apply during this window scaled the Deployment back to the declared count, terminating 4 pods that had been manually added.',
  ],
  'dns-redis': [
    'Redis connection failures began at 18:40 UTC. The Redis hostname DNS A record had been updated to an incorrect IP during routine maintenance 22 minutes prior. The change was not reviewed before application. The monitoring system also used the DNS hostname and reported Redis as healthy, as it was resolving to a host that returned TCP ACK on port 6379.',
    'Redis connection string in the production environment contained a hostname that resolved to 127.0.0.1 due to a split-horizon DNS misconfiguration. The application connected to itself on port 6379. The port was not in use. All cache reads returned connection refused. The configuration had been in this state for 3 weeks without detection.',
  ],
  'dns-oauth': [
    'Following certificate rotation at 10:00 UTC, the OAuth discovery endpoint returned stale TLS configuration to clients that had cached the prior DNS response. The DNS TTL was 14,400 seconds and had not been reduced before the rotation. Clients that had resolved the endpoint within the prior 4 hours continued to present the old certificate. Impact duration: 4 hours 12 minutes.',
    'OAuth redirect URI validation failed for users on ISPs whose resolvers had not propagated a DNS update made 6 hours prior. The A record had been updated as part of a data center migration. Affected users received an "invalid redirect URI" error. The DNS propagation status was not verified before traffic was migrated.',
  ],
  'dns-kafka': [
    'Kafka bootstrap server DNS records resolved to an incorrect IP for a 6-minute window beginning at 08:17 UTC. No configuration changes were recorded in the change log for this period. The issue did not recur. Root cause was not identified. 14,000 events were not produced during the affected window.',
    'Kafka broker hostname kafka.internal was updated to point to kafka-v2.internal via CNAME at 15:00 UTC as part of a cluster migration. The CNAME target was not yet resolvable. Producers received UnknownHostException for 9 minutes until the target record was added. 3 producer instances did not reconnect automatically after resolution was restored.',
  ],
  'dns-ai': [
    'AI API gateway was unreachable for 8 hours beginning at 20:00 UTC. The DNS A record TTL was 0. Network-level resolver at the corporate egress point cached the record for 8 hours regardless of TTL. The gateway IP had changed following a provider migration. Workaround applied: direct IP substitution in application configuration.',
    'AI provider endpoint hostname changed without advance notice. The prior hostname continued to resolve via DNS for 72 hours due to TTL, pointing to the decommissioned address. During this window, all requests to the prior hostname returned connection timeout. The application did not surface the connection error to end users; requests silently returned empty responses.',
  ],
  'dns-docker': [
    'CI pipeline stalled at 47% image layer download following expiration of the Docker registry domain. 14 concurrent build jobs were affected. The domain renewal had lapsed 3 days prior. The registry was not monitored for availability. Estimated cumulative delay across affected jobs: 3 hours 20 minutes.',
    'Docker daemon was unable to resolve docker.io at 07:32 UTC. The corporate DNS resolver returned NXDOMAIN for external hostnames during a 4-minute reconfiguration window. 8 image pull operations failed non-atomically, leaving partially downloaded layers on disk. The build system did not retry failed pulls.',
  ],
  'dns-terraform': [
    'terraform apply failed during a data source read of a DNS zone that had been created 400 milliseconds earlier in the same apply run. DNS propagation delay caused the zone to be unresolvable at the time of the lookup. The apply was re-run manually after a 2-minute wait and completed successfully. The race condition is reproducible on cold environments.',
    'Terraform remote state backend hostname was not resolvable within the production VPC. The backend was configured with a public hostname that the internal DNS resolver did not forward. All terraform operations failed with a connection error. The configuration had worked correctly in the staging VPC, which used a different DNS forwarder.',
  ],
  'redis-oauth': [
    'Session token eviction from Redis began at 19:45 UTC under LRU policy during a traffic spike. 1,847 authenticated sessions were invalidated. Users were required to re-authenticate. Root cause: Redis maxmemory-policy was set to allkeys-lru with a limit that had not been adjusted following a 40% increase in active session volume over the prior quarter.',
    'Redis session TTL was set to 300 seconds. OAuth access tokens issued by the provider had a lifetime of 3,600 seconds. Sessions expired before the token, causing the application to attempt token introspection against an invalidated session record. The error manifested as a successful token validation followed by a missing session error, which was not handled.',
  ],
  'redis-kafka': [
    'Redis AOF persistence failed at 23:41 UTC due to disk exhaustion on the host. Consumer group offsets stored in Redis for 3 Kafka consumers were lost at the point of failure. Upon Redis restart, all three consumers began reading from offset 0. 12 hours of events were replayed. 6 downstream consumers processed duplicate messages during the replay window.',
    'Redis was introduced as a Kafka replacement to reduce operational overhead. The use case required message ordering guarantees and at-least-once delivery. Redis lists do not provide consumer group semantics. Message ordering was not preserved under concurrent reads. The architectural decision was not reviewed before deployment to production.',
  ],
  'redis-ai': [
    'AI inference responses were cached in Redis without an expiry value set. A model update was deployed 21 days prior to the incident. Cached responses from the previous model version continued to be returned to users. No cache invalidation step was included in the model deployment runbook. The issue was identified when a user submitted a support ticket referencing a feature that had been removed.',
    'Redis evicted all keys at 02:14 UTC due to memory pressure. All subsequent AI inference requests were forwarded to the model API without cache. The model API rate limit of 60 requests per minute was reached within 4 seconds. Requests began returning 429 errors. The application did not implement backoff or user-facing degradation for rate limit responses.',
  ],
  'redis-docker': [
    'Redis container was restarted at 14:00 UTC following a host-level maintenance event. No persistent volume was mounted to the container. Cache contents were lost on restart. Application servers required 34 minutes to rebuild the working set from the primary database. Database CPU utilization reached 97% during the warm-up period.',
    'Redis Docker image was updated from 6.2 to 7.0 during a dependency update cycle. The OBJECT ENCODING command behavior changed between versions in a way that caused the application\'s serialization layer to return null for all reads. The change was not covered by integration tests. The issue was not detected until the image reached production.',
  ],
  'redis-terraform': [
    'terraform destroy was executed against the production Redis cluster at 16:23 UTC. The Terraform workspace variable had been set to "staging" by the previous operator and was not verified before execution. The cluster was unavailable for 2 hours 14 minutes. The most recent automated snapshot was 26 hours old. Data created since that snapshot was not recoverable.',
    'The Redis Terraform module was updated to enable encryption at rest. The module applied the change by replacing the existing cluster. Existing keys were not migrated before replacement. All cache data was lost. The terraform plan output listed the resource as requiring replacement; the output was reviewed and approved.',
  ],
  'oauth-kafka': [
    'OAuth access tokens were embedded in Kafka message headers at publish time. Consumer group lag reached 4 hours due to an upstream processing slowdown. By the time messages reached consumers, 100% of embedded tokens had expired. Token validation failed for all messages at offset 4,000,001 onward. 23,000 events were not retried and were not recoverable from the topic due to retention policy.',
    'Kafka consumer startup required a valid OAuth token to authenticate against the broker. The OAuth server consumed a Kafka topic to populate its token validation cache. Neither service could start without the other being available. Cold-start recovery required manually pre-populating the OAuth cache via a separate script that was not documented.',
  ],
  'oauth-ai': [
    'AI service OAuth refresh token expired at 08:00 UTC. The token had a 90-day lifetime and had not been rotated. The service continued to process requests using cached context from the prior session. Responses were returned without access to current user data. No error was surfaced to end users. The degraded state persisted for 11 hours before an engineer noticed anomalous response content in logs.',
    'OAuth scope review reduced the AI service permissions from read:all to read:profile at 10:00 UTC as part of a least-privilege initiative. The AI service did not handle 403 responses from downstream APIs. It continued to generate responses based on data it no longer had access to, returning responses that referenced fields it could not read. The behavior was not detected by automated testing.',
  ],
  'oauth-docker': [
    'A circular dependency was identified during incident recovery: the Docker registry required OAuth authentication to pull images, and the OAuth service container image was stored in the Docker registry. Following a full environment loss, neither service could be started without the other. Recovery required manual credential injection and a temporary unauthenticated registry. Recovery time: 1 hour 40 minutes. The dependency had not been documented.',
    'OAuth client secret was written into the Dockerfile as a build argument and recorded in the image layer history. The image was published to a public registry as part of an open-source build pipeline. The secret was valid for 18 months. Exposure was identified during a routine security audit 4 months after publication.',
  ],
  'oauth-terraform': [
    'Terraform could not provision the OAuth server because the Terraform provider required an OAuth token for authentication, and no OAuth server existed in the environment. Initial bootstrapping of a new environment required a manual credential issuance step that was not included in the Terraform configuration or the environment setup documentation.',
    'OAuth application client ID and client secret were hardcoded in the Terraform configuration and committed to the version control repository. The repository was private. It was made public 6 weeks later as part of an open-source initiative. The secrets were rotated 3 days after the repository visibility change, following an automated secret scanning alert.',
  ],
  'kafka-ai': [
    'AI model fine-tuning pipeline consumed 90 days of production Kafka event history. The training window included a 12-day period of known data quality issues caused by a prior incident that had been remediated. The data quality incident had been closed without flagging downstream consumers. Model behavior regression was attributed to the contaminated training window during post-incident review.',
    'AI-generated content was published to a Kafka topic at an observed rate of 10,000 events per second following a prompt injection in user-submitted input. The downstream consumer processed all events without filtering. The topic retention policy retained all events for 7 days. Consumer lag reached 70,000,000 messages before the producer was paused.',
  ],
  'kafka-docker': [
    'Kafka broker container was configured with a JVM heap of 4 GB. The host had 3.9 GB of available memory at container start time. The container started successfully. Under production message volume, the JVM exceeded available memory after 4 minutes of operation. The container health check, which polled the broker API, passed during the startup window and continued to report healthy until the OOM event.',
    'docker-compose down was executed on the host running the Kafka cluster at 11:30 UTC by an engineer performing unrelated maintenance. The command terminated all containers on the host, including the Kafka broker. In-flight messages that had been acknowledged but not yet replicated to followers were lost. Estimated message loss: 2,400 events. The Kafka cluster was single-node.',
  ],
  'kafka-terraform': [
    'A Kafka topic was deleted and recreated by Terraform to increase the partition count from 3 to 12. The terraform plan indicated the resource would be replaced. In-flight messages present in the original topic at time of deletion were not migrated prior to the operation. Estimated message loss: 180,000 events. Downstream consumers were not notified before the operation began.',
    'The Kafka Terraform module used a create-before-destroy lifecycle. A topic with the same name had been created manually outside of Terraform. The module attempted to create a duplicate topic, which Kafka rejected. Terraform then attempted to destroy the existing topic to resolve the conflict. The existing topic contained 6 hours of unprocessed events.',
  ],
  'ai-docker': [
    'Deployment failed at 09:15 UTC due to insufficient storage in the container registry. Image size: 71.2 GB. Available storage at time of push: 70.5 GB. The docker push command exited with a non-zero code. The CI pipeline step was configured to ignore exit codes for push operations. The deployment was marked successful. The prior image version continued to serve traffic without indication of the failure.',
    'AI inference container exited with code 0 and produced no output at 03:00 UTC. The container orchestrator evaluated the exit code and marked the container as completed successfully. No restart policy was applied to zero-exit containers. The inference service was unavailable for 4 hours until the next scheduled health check triggered an alert.',
  ],
  'ai-terraform': [
    'GPU instances were scheduled for nightly termination by a Terraform-managed cost optimization policy. In-memory model state was not persisted to durable storage before termination. On next-day cold start, model reload from object storage averaged 22 minutes. Inference requests during this window returned 503 errors. The policy had been in place for 6 months. The cold-start latency had not been measured until this incident.',
    'The Terraform module managing the AI inference infrastructure was 4,200 lines, generated by an AI assistant as part of an infrastructure-as-code migration. The module had not been reviewed in full. A planned module update failed at apply time due to a resource dependency cycle within the generated configuration. The cycle was not present in the plan output.',
  ],
  'docker-terraform': [
    'A mutual build dependency was identified between the Terraform binary and the Docker image used to execute it. The Docker image was built using a Terraform step. Terraform required the Docker image to run. Following a full environment rebuild, neither artifact could be produced without the other. A bootstrapping procedure was developed during the incident. It was not documented before the engineer who performed it left the company.',
    'The Dockerfile included a RUN terraform plan step to validate infrastructure configuration at build time. The Terraform configuration referenced a Docker image tag that was produced by the current build. The build could not complete because the image it referenced did not yet exist. The dependency had been introduced 3 weeks prior and had not been detected because the image tag was previously cached.',
  ],
};

const TRIPLE_THEORIES: string[] = [
  'Three independent systems were involved in the incident. No single team had visibility into the full request path. Time to identify the root cause component: 3 hours 14 minutes. Time to full service restoration: 5 hours 52 minutes.',
  'Incident spanned three system boundaries. Each system reported healthy to its own monitoring. The failure was only observable at the user-facing layer. A unified tracing solution was listed as a Q3 priority at the time of the incident.',
  'The incident required on-call escalation to three separate teams. Coordination overhead was identified as a contributing factor to time-to-resolution in the post-mortem. A unified incident channel was created as a follow-up action item.',
  'Three systems were implicated. Each had been modified in the 48 hours prior to the incident. The change that introduced the failure was not identified with certainty. All three changes were rolled back as a precaution.',
];

const QUAD_THEORIES: string[] = [
  'Four contributing systems were identified. Each was owned by a separate team. The incident bridge call had 11 participants. The initial hypothesis was incorrect. Time to correct hypothesis: 2 hours 10 minutes.',
  'The incident affected four systems in sequence. The blast radius was not fully understood until 90 minutes after initial detection. Two of the four systems had no runbook for this failure mode.',
  'Four teams were paged. Two teams initially reported no anomalies in their systems. The anomalies were identified on second review after the blast radius was established. Monitoring coverage gaps were noted in the post-mortem.',
  'Root cause was determined to be a change in system A that propagated through systems B, C, and D over a 40-minute window. Each propagation step introduced an additional 8 to 12 minute delay in detection.',
];

const QUINTET_THEORIES: string[] = [
  'Five systems were involved. The incident response runbook did not cover a failure mode spanning more than three systems. A new runbook was authored during the incident. Post-incident action item count: 14. Items closed within 30 days: 3.',
  'The failure cascade crossed five system boundaries before surfacing as a user-visible error. Each boundary introduced latency in error propagation. Total time from root cause event to first customer report: 23 minutes.',
  'Five on-call engineers were engaged simultaneously. The incident was not formally declared for 35 minutes after initial detection, as each team believed the issue was isolated to another system.',
  'Incident timeline reconstruction required correlating logs from five separate systems with incompatible timestamp formats. Three systems used UTC, one used local time, and one used Unix milliseconds without timezone context. Timeline reconstruction took 4 hours.',
];

const SEXTET_THEORIES: string[] = [
  'Six systems were implicated. The dependency graph had not been documented. It was reconstructed from memory during the incident. Gaps in the reconstruction were identified in the post-mortem.',
  'The incident spanned six teams and six codebases. No engineer had direct familiarity with more than two of the affected systems. Knowledge transfer between teams occurred in real time during the incident bridge call.',
  'Six contributing factors were identified in the post-mortem. Each factor alone would not have caused an outage. The combination had not been considered in any prior failure mode analysis.',
];

const SEPTET_PLUS_THEORIES: string[] = [
  'All primary systems were involved in the incident. Blast radius assessment was not completed until after service was restored. The incident was escalated to executive leadership at the 3-hour mark. A cross-functional architectural review was scheduled.',
  'The failure involved every system in this diagram. The post-mortem document was 34 pages. The root cause section was 2 sentences. Seventeen action items were created. The priority of each was listed as P2.',
  'All systems reported degraded or failed state simultaneously. The order of failure could not be determined from available logs due to gaps in distributed tracing coverage. The incident was classified as a cascading failure with no single root cause.',
];

const CONCLUSION_LINES = [
  'A simpler architecture was proposed during the original design review. The proposal was not adopted. The decision rationale was not documented.',
  'The workload was migrated from a single-server deployment 18 months prior. The migration added 4 new failure domains. The original server had 99.97% uptime over 3 years.',
  'The engineer who designed this system is no longer with the organization. No architecture decision records exist.',
  'The system documentation describes the architecture as "straightforward." The incident duration was 6 hours.',
  'Monthly infrastructure cost at time of incident: $47,000. The feature being served: a paginated list of user records.',
  'Median time to first byte: 4.2 seconds. Each system in this diagram contributes measurably to that latency. The product requirement was sub-500ms.',
  'The original delivery timeline for this architecture was 2 weeks. Actual time to production-ready state: 7 months.',
  'An equivalent outcome could have been achieved with a scheduled task and a relational database. This option was not evaluated.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('-');
}

function generateTheories(connections: Array<[string, string]>): TheoryEntry[] {
  if (connections.length === 0) return [];

  const entries: TheoryEntry[] = [];
  const usedPairKeys = new Set<string>();

  for (const [a, b] of connections) {
    const key = pairKey(a, b);
    if (!usedPairKeys.has(key)) {
      usedPairKeys.add(key);
      const pool = PAIR_THEORIES[key];
      if (pool) {
        entries.push({ icon: '🔴', text: pickRandom(pool) });
      }
    }
  }

  const n = connections.length;
  if (n >= 3 && n < 4) entries.push({ icon: '📌', text: pickRandom(TRIPLE_THEORIES) });
  if (n >= 4 && n < 5) entries.push({ icon: '🗂️',  text: pickRandom(QUAD_THEORIES) });
  if (n >= 5 && n < 6) entries.push({ icon: '🚨', text: pickRandom(QUINTET_THEORIES) });
  if (n >= 6 && n < 7) entries.push({ icon: '☢️',  text: pickRandom(SEXTET_THEORIES) });
  if (n >= 7)          entries.push({ icon: '💀', text: pickRandom(SEPTET_PLUS_THEORIES) });

  if (n >= 2) {
    entries.push({ icon: '⚠️', text: pickRandom(CONCLUSION_LINES), final: true });
  }

  return entries;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

interface PinPosition {
  id: string;
  x: number;
  y: number;
}

function layoutPins(techs: Tech[], width: number, height: number): PinPosition[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.min(width * 0.38, 200);
  const ry = Math.min(height * 0.38, 180);
  return techs.map((t, i) => {
    const angle = (i / techs.length) * Math.PI * 2 - Math.PI / 2;
    return { id: t.id, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

const PIN_RADIUS = 26;

function drawBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pins: PinPosition[],
  connections: Array<[string, string]>,
  hoverPin: string | null,
  selectedPin: string | null,
  draggingConnection: { from: string; toX: number; toY: number } | null,
  techMap: Map<string, Tech>,
  animOffset: number,
) {
  // Cork background
  ctx.fillStyle = '#c8954a';
  ctx.fillRect(0, 0, w, h);

  // Cork texture dots
  ctx.save();
  for (let xi = 0; xi < w; xi += 28) {
    for (let yi = 0; yi < h; yi += 24) {
      const jx = (xi + yi * 0.3) % 7 - 3;
      const jy = (yi + xi * 0.4) % 6 - 3;
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = '#7a4e2d';
      ctx.beginPath();
      ctx.ellipse(xi + jx, yi + jy, 4 + (xi % 5), 2 + (yi % 3), 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Grain overlay
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#3d1f00';
  for (let i = 0; i < 60; i++) {
    const lx = (i * 137.5) % w;
    const ly = (i * 93.7) % h;
    ctx.fillRect(lx, ly, w / 15, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Draw existing connections
  for (const [a, b] of connections) {
    const pa = pins.find((p) => p.id === a);
    const pb = pins.find((p) => p.id === b);
    if (!pa || !pb) continue;
    drawString(ctx, pa.x, pa.y, pb.x, pb.y, animOffset, false);
  }

  // Draw dragging string
  if (draggingConnection) {
    const pa = pins.find((p) => p.id === draggingConnection.from);
    if (pa) {
      drawString(ctx, pa.x, pa.y, draggingConnection.toX, draggingConnection.toY, animOffset, true);
    }
  }

  // Draw pins
  for (const pin of pins) {
    const tech = techMap.get(pin.id);
    if (!tech) continue;
    const isSelected = pin.id === selectedPin;
    const isHovered  = pin.id === hoverPin;
    drawPin(ctx, pin.x, pin.y, tech, isSelected, isHovered);
  }
}

function drawString(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  animOffset: number,
  dashed: boolean,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + Math.sqrt(dx * dx + dy * dy) * 0.12;

  ctx.save();
  ctx.strokeStyle = dashed ? 'rgba(220,38,38,0.6)' : '#dc2626';
  ctx.lineWidth = dashed ? 1.5 : 2.2;
  ctx.shadowColor = '#dc2626';
  ctx.shadowBlur = dashed ? 4 : 8;

  if (dashed) {
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -animOffset * 0.05;
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tech: Tech,
  selected: boolean,
  hovered: boolean,
) {
  const r = PIN_RADIUS;
  const scale = selected ? 1.15 : hovered ? 1.08 : 1;
  const sr = r * scale;

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  // Note background (yellow paper)
  ctx.fillStyle = selected ? '#fef3c7' : '#fefce8';
  ctx.strokeStyle = selected ? tech.color : hovered ? '#dc2626' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  roundRect(ctx, -sr, -sr, sr * 2, sr * 2, 5);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Pin head
  ctx.fillStyle = selected ? '#dc2626' : tech.color;
  ctx.beginPath();
  ctx.arc(0, -sr + 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Emoji
  ctx.font = `${sr * 0.78}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tech.emoji, 0, 2);

  // Label
  ctx.font = `bold ${Math.max(9, sr * 0.35)}px 'Courier New', monospace`;
  ctx.fillStyle = '#1c1917';
  ctx.fillText(tech.label, 0, sr * 0.72);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hitTest(pins: PinPosition[], mx: number, my: number): string | null {
  for (const p of pins) {
    const dx = mx - p.x;
    const dy = my - p.y;
    if (dx * dx + dy * dy <= (PIN_RADIUS * 1.2) ** 2) return p.id;
  }
  return null;
}

// ── React component ───────────────────────────────────────────────────────────

const TECH_MAP = new Map<string, Tech>(TECHS.map((t) => [t.id, t]));

export default function ConspiracyBoardPage() {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animRef        = useRef<number>(0);
  const animOffset     = useRef<number>(0);
  const pinsRef        = useRef<PinPosition[]>([]);

  const [connections,  setConnections]  = useState<Array<[string, string]>>([]);
  const [selectedPin,  setSelectedPin]  = useState<string | null>(null);
  const [hoverPin,     setHoverPin]     = useState<string | null>(null);
  const [dragging,     setDragging]     = useState<{ from: string; toX: number; toY: number } | null>(null);
  const [theories,     setTheories]     = useState<TheoryEntry[]>([]);
  const [isDragging,   setIsDragging]   = useState(false);

  // Layout pins on mount / resize — always in CSS pixel space
  const relayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pinsRef.current = layoutPins(TECHS, canvas.clientWidth, canvas.clientHeight);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr  = window.devicePixelRatio || 1;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      relayout();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [relayout]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const connectionsSnap = connections;
    const selectedSnap    = selectedPin;
    const hoverSnap       = hoverPin;
    const draggingSnap    = dragging;

    const loop = () => {
      animRef.current = requestAnimationFrame(loop);
      animOffset.current += 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.clientWidth;
      const h   = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard(ctx, w, h, pinsRef.current, connectionsSnap, hoverSnap, selectedSnap, draggingSnap, TECH_MAP, animOffset.current);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [connections, selectedPin, hoverPin, dragging]);

  // Theory updates
  useEffect(() => {
    setTheories(generateTheories(connections));
  }, [connections]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    return {
      x: cx - rect.left,
      y: cy - rect.top,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    if (hit) {
      setIsDragging(true);
      if (selectedPin === null) {
        setSelectedPin(hit);
        setDragging({ from: hit, toX: x, toY: y });
      } else if (selectedPin === hit) {
        setSelectedPin(null);
        setDragging(null);
      } else {
        const key = pairKey(selectedPin, hit);
        const existing = connections.some(([a, b]) => pairKey(a, b) === key);
        if (existing) {
          setConnections((prev) => prev.filter(([a, b]) => pairKey(a, b) !== key));
        } else {
          setConnections((prev) => [...prev, [selectedPin, hit]]);
        }
        setSelectedPin(null);
        setDragging(null);
      }
    } else {
      setSelectedPin(null);
      setDragging(null);
    }
  }, [selectedPin, connections]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    setHoverPin(hit);
    if (dragging) {
      setDragging((d) => d ? { ...d, toX: x, toY: y } : null);
    }
  }, [dragging]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    if (hit && dragging && hit !== dragging.from) {
      const key = pairKey(dragging.from, hit);
      const existing = connections.some(([a, b]) => pairKey(a, b) === key);
      if (!existing) {
        setConnections((prev) => [...prev, [dragging.from, hit]]);
      }
      setSelectedPin(null);
      setDragging(null);
    }
  }, [isDragging, dragging, connections]);

  const handleMouseLeave = useCallback(() => {
    setHoverPin(null);
    if (dragging) {
      setDragging(null);
      setIsDragging(false);
    }
  }, [dragging]);

  const handleReset = useCallback(() => {
    setConnections([]);
    setSelectedPin(null);
    setDragging(null);
    setTheories([]);
  }, []);

  const connectedTechs = new Set(connections.flat());

  return (
    <Layout
      title="The Engineering Conspiracy Board™"
      description="Connect technologies with red string and discover what really went wrong."
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.breadcrumb}>
            <a href="/tools">Tools</a>
            <span> / </span>
            <span>The Engineering Conspiracy Board™</span>
          </div>
          <h1 className={styles.pageTitle}>
            <span className={styles.pageTitleAccent}>The Engineering Conspiracy Board™</span>
          </h1>
          <p className={styles.pageSubtitle}>
            Connect technologies with red string. Uncover the truth behind every outage.
          </p>
        </div>

        <div className={styles.boardWrap}>
          <canvas
            ref={canvasRef}
            className={`${styles.boardCanvas} ${isDragging ? styles.dragging : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </div>

        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Connections:</span>
            <span className={styles.statValue}>{connections.length}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Technologies implicated:</span>
            <span className={styles.statValue}>{connectedTechs.size}</span>
          </div>
          {connections.length >= 6 && (
            <div className={styles.statItem}>
              <span className={styles.statValue}>☢️ MAXIMUM CHAOS ACHIEVED</span>
            </div>
          )}
          <button className={styles.resetBtn} onClick={handleReset}>
            Clear board
          </button>
        </div>

        {theories.length > 0 && (
          <div className={styles.theoryPanel}>
            <div className={styles.theoryHeader}>
              <span className={styles.theoryHeaderIcon}>📋</span>
              INCIDENT INVESTIGATION FINDINGS
              <span className={styles.theoryBadge}>CLASSIFIED</span>
            </div>
            <div className={styles.theoryBody}>
              <ul className={styles.theoryList}>
                {theories.map((t, i) => (
                  <li key={i} className={`${styles.theoryItem} ${t.final ? styles.theoryItemFinal : ''}`}>
                    <span className={styles.theoryIcon}>{t.icon}</span>
                    <span className={styles.theoryText}>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className={styles.instructions}>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>1</span>
            Click a technology to select it
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>2</span>
            Click another to connect with red string
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>3</span>
            Click a connection again to remove it
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>4</span>
            Watch the conspiracy unfold
          </div>
        </div>
      </div>
    </Layout>
  );
}
