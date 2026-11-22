/**
 * @envoy/app — the Envoy product experience, shared by the web app and the Chrome extension's side
 * panel: the chat with its privacy flight recorder, the approval card, the review components, the
 * runtime hook (Firebase AI Logic hybrid models + device guard) and document reading.
 */
export { ChatApp, type ChatAppProps, type RulesStore } from './chat/ChatApp';
export { FlightRecorder, buildRows } from './chat/FlightRecorder';
export { useEnvoy, type EnvoyConfig, type EnvoyRuntime, type EnvoyStatus } from './app/useEnvoy';
export {
  initialSession,
  sessionReducer,
  type AnswerResult,
  type Phase,
  type SessionAction,
  type SessionDoc,
  type SessionState,
} from './app/session';
export { NOTICES, runAnalysis } from './app/actions';
export { AboutDialog } from './components/AboutDialog';
export { LiveRegion } from './components/LiveRegion';
export { NetworkInspector } from './components/NetworkInspector';
export { OfflineBanner } from './components/OfflineBanner';
export { CloudPreview } from './components/review/CloudPreview';
export { DocumentViewer } from './components/review/DocumentViewer';
export { FoundList } from './components/review/FoundList';
export { FileReadError, readDocumentFile, type ReadDocument } from './lib/readFile';
