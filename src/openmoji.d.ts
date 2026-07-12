declare module 'openmoji/data/openmoji.json' {
  export interface OpenMojiEntry {
    emoji: string;
    hexcode: string;
    group: string;
    subgroups: string;
    annotation: string;
    tags?: string;
    openmoji_tags?: string;
    unicode?: number;
    order?: number;
  }

  const openmojiEntries: OpenMojiEntry[];
  export default openmojiEntries;
}
