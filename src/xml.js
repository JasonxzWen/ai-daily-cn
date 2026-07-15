const MAX_UNICODE_CODE_POINT = 0x10ffff;
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["mdash", "—"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["quot", '"']
]);
const XML_ENTITY_PATTERN = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi;

export function decodeXmlEntitiesOnce(value) {
  return String(value ?? "").replace(XML_ENTITY_PATTERN, (entity, decimal, hexadecimal, named) => {
    if (decimal) return decodeCodePoint(entity, decimal, 10);
    if (hexadecimal) return decodeCodePoint(entity, hexadecimal, 16);
    return NAMED_ENTITIES.get(String(named || "").toLowerCase()) ?? entity;
  });
}

function decodeCodePoint(entity, code, radix) {
  const value = Number.parseInt(code, radix);
  if (!Number.isInteger(value) || value < 0 || value > MAX_UNICODE_CODE_POINT || (value >= 0xd800 && value <= 0xdfff)) {
    return entity;
  }
  return String.fromCodePoint(value);
}
