import { genericWebConnector } from './genericWeb'

// Modular registry: add new connectors here without touching the engine.
const CONNECTORS = {
  [genericWebConnector.key]: genericWebConnector,
}

export function getConnector(key) {
  return CONNECTORS[key] || genericWebConnector
}

export function listConnectors() {
  return Object.values(CONNECTORS).map((c) => ({ key: c.key, label: c.label }))
}
