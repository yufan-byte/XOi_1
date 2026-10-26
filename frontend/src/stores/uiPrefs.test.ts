import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import uiPrefsStore from './uiPrefs';

function setup(initial: Record<string,string> = {}) {
  const saved = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key:string) => saved.get(key) ?? null,
    setItem: (key:string,value:string) => saved.set(key,String(value)),
    removeItem: (key:string) => saved.delete(key),
  } });
  setActivePinia(createPinia());
  return { store: uiPrefsStore(), saved };
}
test('desktop starts expanded, even with an old automatic-collapse flag', () => {
  const {store}=setup({'xoi.sidebar.auto-collapsed':'1'});
  assert.equal(store.isSidebarCollapsed(),false);
  store.collapseSidebarForNavigation();
  assert.equal(store.isSidebarCollapsed(),false);
});
test('only an explicit toggle collapses, and navigation preserves the choice', () => {
  const {store,saved}=setup();
  store.toggleSidebar(false);
  assert.equal(store.isSidebarCollapsed(),true);
  assert.equal(saved.get('xoi.sidebar.preference'),'compact');
  store.collapseSidebarForNavigation();
  assert.equal(store.isSidebarCollapsed(),true);
  store.toggleSidebar(true);
  store.collapseSidebarForNavigation();
  assert.equal(store.isSidebarCollapsed(),false);
  assert.equal(saved.get('xoi.sidebar.preference'),'expanded');
});
test('previous manual collapse is respected rather than silently overwritten', () => {
  const {store}=setup({'xoi.sidebar.preference':'compact'});
  assert.equal(store.isSidebarCollapsed(),true);
  store.collapseSidebarForNavigation();
  assert.equal(store.isSidebarCollapsed(),true);
});
test('invalid saved preferences recover to a visible expanded sidebar', () => {
  const {store}=setup({'xoi.sidebar.preference':'invalid','xoi.sidebar.auto-collapsed':'1'});
  assert.equal(store.isSidebarCollapsed(),false);
});
