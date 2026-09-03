import { genericWebConnector } from './genericWeb'
import { csvDatasetConnector } from './csvDataset'

// Modular registry: add new connectors here without touching the engine.
const CONNECTORS = {
  [genericWebConnector.key]: genericWebConnector,
  [csvDatasetConnector.key]: csvDatasetConnector,
}

export function getConnector(key) {
  return CONNECTORS[key] || genericWebConnector
}

export function listConnectors() {
  return Object.values(CONNECTORS).map((c) => ({ key: c.key, label: c.label }))
}
