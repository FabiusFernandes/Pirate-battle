import { useSyncExternalStore } from 'react';

export interface ReadableStore<T> {
  readonly getSnapshot: () => T;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Minimal observable value used to bridge non-React systems (simulation, asset loader,
 * audio) with React through `useSyncExternalStore`. Listeners are only notified when the
 * value actually changes, so publishers can call `set` freely.
 */
export class Store<T> implements ReadableStore<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();

  constructor(
    initial: T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {
    this.value = initial;
  }

  getSnapshot = (): T => this.value;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(next: T): void {
    if (this.equals(this.value, next)) return;
    this.value = next;
    for (const listener of [...this.listeners]) listener();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.value));
  }
}

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Shallow equality for plain objects; handy for snapshot stores. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}
