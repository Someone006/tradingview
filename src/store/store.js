/**
 * Filesystem-backed run store.
 *
 * A flat directory of JSON runs plus a small index. No database to install,
 * nothing to migrate, trivially backed up by copying a folder - which is what
 * a self-hosted buyer actually wants.
 * @module store/store
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { slug } from '../util/id.js';
import { DEFAULTS } from '../config.js';

export class Store {
  /** @param {string} [dir] */
  constructor(dir = DEFAULTS.dataDir) {
    this.dir = path.resolve(dir);
    this.runsDir = path.join(this.dir, 'runs');
    mkdirSync(this.runsDir, { recursive: true });
  }

  /** @param {string} brandDomain */
  brandKey(brandDomain) { return slug(brandDomain); }

  /**
   * Persist a report and update the index.
   * @param {import('../types.js').AuditReport} report
   * @returns {string} Path written.
   */
  save(report) {
    const key = this.brandKey(report.brand.domain);
    const dir = path.join(this.runsDir, key);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${report.id}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    this.writeIndexEntry(key, report);
    return file;
  }

  /**
   * @param {string} key
   * @param {import('../types.js').AuditReport} report
   */
  writeIndexEntry(key, report) {
    const idxFile = path.join(this.runsDir, key, 'index.json');
    /** @type {any[]} */
    let idx = [];
    if (existsSync(idxFile)) {
      try { idx = JSON.parse(readFileSync(idxFile, 'utf8')); } catch { idx = []; }
    }
    idx = idx.filter((e) => e.id !== report.id);
    idx.push({
      id: report.id,
      createdAt: report.createdAt,
      brand: report.brand.name,
      domain: report.brand.domain,
      composite: report.meta.compositeScore,
      grade: report.meta.grade,
      readiness: report.readiness?.overall ?? null,
      visibility: report.visibility?.skipped ? null : (report.visibility?.score ?? null),
      mentionRate: report.visibility?.mentionRate ?? null,
      simulated: !!report.simulated,
      blocked: !!report.readiness?.blocked,
      recommendations: (report.recommendations || []).length,
    });
    idx.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    writeFileSync(idxFile, JSON.stringify(idx, null, 2));
  }

  /** All tracked brand keys. */
  brands() {
    if (!existsSync(this.runsDir)) return [];
    return readdirSync(this.runsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const idx = this.history(d.name);
        return {
          key: d.name,
          name: idx[0]?.brand || d.name,
          domain: idx[0]?.domain || d.name,
          runs: idx.length,
          latest: idx[0] || null,
        };
      })
      .filter((b) => b.runs > 0)
      .sort((a, b) => String(b.latest?.createdAt).localeCompare(String(a.latest?.createdAt)));
  }

  /**
   * Run history for a brand, newest first.
   * @param {string} key
   */
  history(key) {
    const idxFile = path.join(this.runsDir, this.brandKey(key), 'index.json');
    if (!existsSync(idxFile)) return [];
    try { return JSON.parse(readFileSync(idxFile, 'utf8')); } catch { return []; }
  }

  /**
   * Load a full report.
   * @param {string} key @param {string} id
   * @returns {import('../types.js').AuditReport|null}
   */
  load(key, id) {
    // Guard against path traversal via a crafted id from the HTTP layer.
    if (!/^[A-Za-z0-9._-]+$/.test(String(id))) return null;
    const file = path.join(this.runsDir, this.brandKey(key), `${id}.json`);
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
  }

  /**
   * Most recent report for a brand.
   * @param {string} key
   */
  latest(key) {
    const idx = this.history(key);
    return idx.length ? this.load(key, idx[0].id) : null;
  }

  /**
   * Previous run, for delta computation.
   * @param {string} key @param {string} [excludeId]
   */
  previous(key, excludeId) {
    const idx = this.history(key).filter((e) => e.id !== excludeId);
    return idx.length ? this.load(key, idx[0].id) : null;
  }

  /**
   * Trend series for charting.
   * @param {string} key
   */
  trend(key) {
    return this.history(key).slice().reverse().map((e) => ({
      id: e.id,
      date: e.createdAt,
      composite: e.composite,
      readiness: e.readiness,
      visibility: e.visibility,
      mentionRate: e.mentionRate,
    }));
  }

  /** @param {string} key */
  remove(key) {
    const dir = path.join(this.runsDir, this.brandKey(key));
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}
