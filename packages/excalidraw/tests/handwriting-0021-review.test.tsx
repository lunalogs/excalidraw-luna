import {
  createPanelPresetLibrary,
  createPresetLibrary,
  getSessionPresetLibrary,
  __resetUnifiedPresetLibraryForTests,
  BRUSH_PRESETS_STORAGE_KEY as key,
} from "../handwriting/brushPresets";
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  __resetUnifiedPresetLibraryForTests();
});
afterEach(() => vi.restoreAllMocks());
const input = (name: string, strokeWidth = 2) => ({
  ...getSessionPresetLibrary().getBuiltinPresets()[0],
  name,
  strokeWidth,
});
it.each(["My pen", "A".repeat(40)])(
  "preserves case-insensitive conflicts and existing suffix at %s",
  (name) => {
    const disk = createPresetLibrary();
    const result = disk.add(input(name));
    if (!result.ok) {
      throw new Error("seed");
    }
    const original = Storage.prototype.getItem;
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (this: Storage, k: string) {
        if (k === key) {
          throw new Error("read blocked");
        }
        return original.call(this, k);
      });
    const library = createPanelPresetLibrary();
    library.add(input(name.toLowerCase(), 8));
    library.add(input(`${name.slice(0, 36)} (2)`, 4));
    spy.mockRestore();
    for (let i = 0; i < 3; i++) {
      expect(library.retryPersist()).toBe(true);
    }
    const presets = library.list();
    expect(presets).toHaveLength(3);
    expect(new Set(presets.map((p) => p.name.toLowerCase())).size).toBe(3);
    expect(presets.every((p) => p.name.length <= 40)).toBe(true);
    const recovered = library.get(result.preset.id)!;
    expect(recovered.name).toBe(`${name.slice(0, 36)} (3)`);
    expect(recovered.updatedAt).toBe(result.preset.updatedAt);
    expect(recovered.strokeWidth).toBe(2);
    expect(JSON.parse(localStorage.getItem(key)!).presets).toEqual(presets);
  },
);

it("same id retains authority edits without duplicate inflation", () => {
  const disk = createPresetLibrary();
  const result = disk.add(input("Identity pen"));
  if (!result.ok) {
    throw new Error("seed");
  }
  getSessionPresetLibrary().addRecovered(
    { ...result.preset, strokeWidth: 8 },
    { id: result.preset.id, updatedAt: result.preset.updatedAt + 1 },
  );
  const library = createPanelPresetLibrary();
  for (let i = 0; i < 3; i++) {
    expect(library.retryPersist()).toBe(true);
  }
  expect(library.list()).toHaveLength(1);
  expect(library.get(result.preset.id)?.strokeWidth).toBe(8);
});
