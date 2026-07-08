import * as Comlink from "comlink";
import { hasModelInCache, MLCEngine } from "@mlc-ai/web-llm";
import { createEngineAPI } from "./engine-api-factory.js";

// The only module that ever touches the real @mlc-ai/web-llm engine. We use
// the bare MLCEngine (not web-llm's own WebWorkerMLCEngine/Handler pair) so
// there's a single RPC layer — Comlink — rather than layering Comlink on
// top of web-llm's own built-in worker protocol, which would double up on
// the same job and risk both trying to own postMessage.
//
// Tradeoff: WebWorkerMLCEngineHandler's reloadIfUnmatched() recovers from a
// killed ServiceWorker desyncing model state from the frontend's
// expectation. A dedicated Worker (this one) isn't reaped that way, so
// that recovery path doesn't apply here — but if this ever migrates to a
// ServiceWorker (e.g. for offline/extension use), reload-recovery would
// need to be reintroduced by hand.
Comlink.expose(createEngineAPI(new MLCEngine(), hasModelInCache));
