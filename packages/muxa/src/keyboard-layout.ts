// Maps a character typed on a non-Latin keyboard layout to the Latin letter of the same key

const KEY_CODES = 128;

/**
 * Pairs each key's character on the current layout with its Latin letter.
 * Both tables are indexed by key code; keys that type the same character on both layouts are left out.
 */
export function buildLatinKeyMap(
  current: readonly string[],
  latin: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let code = 0; code < Math.min(current.length, latin.length); code++) {
    const typed = current[code];
    const letter = latin[code];
    if (typed && letter && typed !== letter && /^[a-z]$/.test(letter)) {
      map.set(typed, letter);
    }
  }
  return map;
}

/**
 * Reads the key tables from the macOS keyboard layouts through koffi.
 * `sourceId` names an installed input source to read in place of the current one (`com.apple.keylayout.Russian`).
 */
export async function readMacKeyTables(
  sourceId?: string,
): Promise<{ current: string[]; latin: string[] }> {
  // koffi is loaded only here: it is a native module of about 3 MB, and most runs never show a prompt
  const { default: koffi } = await import("koffi");

  const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
  const carbon = koffi.load("/System/Library/Frameworks/Carbon.framework/Carbon");

  const CFStringCreateWithCString = cf.func(
    "void *CFStringCreateWithCString(void *alloc, const char *s, uint32_t enc)",
  );
  const CFDictionaryCreate = cf.func(
    "void *CFDictionaryCreate(void *alloc, void **keys, void **values, long count, void *keyCallBacks, void *valueCallBacks)",
  );
  const CFArrayGetCount = cf.func("long CFArrayGetCount(void *array)");
  const CFArrayGetValueAtIndex = cf.func("void *CFArrayGetValueAtIndex(void *array, long index)");
  const CFDataGetBytePtr = cf.func("void *CFDataGetBytePtr(void *data)");
  const CFRetain = cf.func("void *CFRetain(void *ref)");
  const CFRelease = cf.func("void CFRelease(void *ref)");

  const TISCopyCurrentKeyboardLayoutInputSource = carbon.func(
    "void *TISCopyCurrentKeyboardLayoutInputSource()",
  );
  const TISCopyCurrentASCIICapableKeyboardLayoutInputSource = carbon.func(
    "void *TISCopyCurrentASCIICapableKeyboardLayoutInputSource()",
  );
  const TISCreateInputSourceList = carbon.func(
    "void *TISCreateInputSourceList(void *properties, bool includeAllInstalled)",
  );
  const TISGetInputSourceProperty = carbon.func(
    "void *TISGetInputSourceProperty(void *src, void *key)",
  );
  const LMGetKbdType = carbon.func("uint8_t LMGetKbdType()");
  const UCKeyTranslate = carbon.func(
    "int32_t UCKeyTranslate(void *layout, uint16_t keyCode, uint16_t action, uint32_t mods, uint32_t kbdType, uint32_t opts, _Inout_ uint32_t *dead, unsigned long maxLen, _Out_ unsigned long *len, _Out_ uint16_t *chars)",
  );

  const UTF8 = 0x08000100;
  const kUCKeyActionDisplay = 3;
  const kUCKeyTranslateNoDeadKeysMask = 1;
  // `symbol` gives the address of a global; the `kTISProperty…` keys are the pointers stored there,
  // while the dictionary callbacks are the structs at those addresses
  const constant = (name: string) => koffi.decode(carbon.symbol(name), "void *");
  const kLayoutData = constant("kTISPropertyUnicodeKeyLayoutData");
  const kSourceId = constant("kTISPropertyInputSourceID");

  const findSource = (id: string) => {
    const value = CFStringCreateWithCString(null, id, UTF8);
    const filter = CFDictionaryCreate(
      null,
      [kSourceId],
      [value],
      1,
      cf.symbol("kCFTypeDictionaryKeyCallBacks"),
      cf.symbol("kCFTypeDictionaryValueCallBacks"),
    );
    const list = TISCreateInputSourceList(filter, true);
    CFRelease(filter);
    CFRelease(value);
    if (!list) throw new Error(`No input source ${id}`);
    try {
      if (CFArrayGetCount(list) < 1) throw new Error(`No input source ${id}`);
      return CFRetain(CFArrayGetValueAtIndex(list, 0));
    } finally {
      CFRelease(list);
    }
  };

  const readTable = (source: unknown): string[] => {
    const data = TISGetInputSourceProperty(source, kLayoutData);
    if (!data) throw new Error("The keyboard layout has no Unicode key data");
    const layout = CFDataGetBytePtr(data);
    const kbdType = LMGetKbdType();
    const table: string[] = [];
    for (let code = 0; code < KEY_CODES; code++) {
      const dead = [0];
      const len = [0];
      const chars = new Uint16Array(4);
      const err = UCKeyTranslate(
        layout,
        code,
        kUCKeyActionDisplay,
        0,
        kbdType,
        kUCKeyTranslateNoDeadKeysMask,
        dead,
        chars.length,
        len,
        chars,
      );
      table.push(err === 0 ? String.fromCharCode(...chars.subarray(0, len[0])) : "");
    }
    return table;
  };

  const current = sourceId ? findSource(sourceId) : TISCopyCurrentKeyboardLayoutInputSource();
  const latin = TISCopyCurrentASCIICapableKeyboardLayoutInputSource();
  try {
    return { current: readTable(current), latin: readTable(latin) };
  } finally {
    CFRelease(current);
    CFRelease(latin);
  }
}

/**
 * The map from each character of the current layout to its Latin letter, or null when it cannot be read:
 * off macOS, or when koffi or the OS call fails.
 * `MUXA_TEST_KEYBOARD_LAYOUT` names an installed input source to read in place of the current one, for tests.
 */
export async function loadLatinKeyMap(): Promise<Map<string, string> | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { current, latin } = await readMacKeyTables(process.env.MUXA_TEST_KEYBOARD_LAYOUT);
    return buildLatinKeyMap(current, latin);
  } catch {
    return null;
  }
}
