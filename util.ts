class ExpandMap<K, V> extends Map<K, V> {
  getOr(key: K, defaultValue: V): V {
    if (!this.has(key)) {
      this.set(key, defaultValue);
    }
    return this.get(key)!;
  }

  toObject(): { [key: string]: any } {
    const obj: { [key: string]: any } = {};
    for (const [key, value] of this.entries()) {
      if (value instanceof Map) {
        obj[key as any] = (value as any).toObject();
      } else {
        obj[key as any] = value;
      }
    }
    return obj;
  }
}

module.exports = ExpandMap;
