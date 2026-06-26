import { DEFAULT_SETTINGS } from "./config.mjs";
import { getBackend, resetBackend } from "./storage-backend.mjs";

function baseState() {
  return {
    version: 1,
    settings: DEFAULT_SETTINGS,
    assets: {},
    positions: {},
    sources: {},
    researchReports: {},
    valuationModels: {},
    plans: {},
    events: {},
    traces: {},
    monitorState: {}
  };
}

function normalizeState(state) {
  const empty = baseState();
  return {
    ...empty,
    ...state,
    settings: {
      ...empty.settings,
      ...(state.settings || {}),
      monitorIntervals: {
        ...empty.settings.monitorIntervals,
        ...(state.settings?.monitorIntervals || {})
      },
      maxAllocationByRiskClass: {
        ...empty.settings.maxAllocationByRiskClass,
        ...(state.settings?.maxAllocationByRiskClass || {})
      }
    },
    assets: state.assets || {},
    positions: state.positions || {},
    sources: state.sources || {},
    researchReports: state.researchReports || {},
    valuationModels: state.valuationModels || {},
    plans: state.plans || {},
    events: state.events || {},
    traces: state.traces || {},
    monitorState: state.monitorState || {}
  };
}

export class DataStore {
  constructor() {
    this.state = null;
    this.lastKnownMtimeMs = null;
    this._backendInstance = null;
  }

  async _backend() {
    if (!this._backendInstance) {
      this._backendInstance = await getBackend();
    }
    return this._backendInstance;
  }

  async load() {
    const backend = await this._backend();

    if (this.state) {
      const info = await backend.statBlob();
      if (info && this.lastKnownMtimeMs !== null && info.mtimeMs !== this.lastKnownMtimeMs) {
        this.state = null;
        this.lastKnownMtimeMs = null;
      }
    }

    if (this.state) {
      return this.state;
    }

    const raw = await backend.readBlob();
    if (raw !== null) {
      this.state = normalizeState(raw);
    } else {
      this.state = baseState();
      await backend.writeBlob(this.state);
    }

    const info = await backend.statBlob();
    if (info) {
      this.lastKnownMtimeMs = info.mtimeMs;
    }

    return this.state;
  }

  async save() {
    const backend = await this._backend();
    await backend.writeBlob(this.state);
    const info = await backend.statBlob();
    if (info) {
      this.lastKnownMtimeMs = info.mtimeMs;
    }
  }

  async update(mutator) {
    const state = await this.load();
    const result = await mutator(state);
    await this.save();
    return result;
  }

  resetCache() {
    this.state = null;
    this.lastKnownMtimeMs = null;
    this._backendInstance = null;
    resetBackend();
  }

  async clear() {
    this.state = baseState();
    this.lastKnownMtimeMs = null;
    await this.save();
    return this.state;
  }
}

export const store = new DataStore();
