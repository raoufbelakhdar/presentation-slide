import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Grid3X3,
  EyeOff,
  LayoutList,
  Play,
  Plus,
  Rows3,
  Save,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { FEATURED_ICON_NAMES, formatIconName } from '../iconLibrary';
import { buildSceneFromScript, loadScripts, reconcileScriptWords, saveScripts } from '../script';
import { mergeAssetLibraries, generateId } from '../utils';
import {
  DictionaryEntry,
  SavedComponent,
  ScriptDefinition,
  ScriptLayout,
  ScriptWord,
  ScriptWordAssociation,
} from '../types';

const layoutOptions: Array<{ value: ScriptLayout; label: string; icon: typeof Rows3 }> = [
  { value: 'horizontal', label: 'Horizontal', icon: Rows3 },
  { value: 'vertical', label: 'Vertical', icon: LayoutList },
  { value: 'grid', label: 'Grid', icon: Grid3X3 },
];

function associationLabel(association?: ScriptWordAssociation) {
  if (!association) return 'Choose a component';
  if (association.kind === 'ignored') return 'Ignored';
  if (association.kind === 'text') return association.variant === 'block' ? 'Text block' : 'Text';
  if (association.kind === 'icon') return `Icon · ${formatIconName(association.iconName)}`;
  if (association.kind === 'asset') return 'Image';
  return association.component.name;
}

export function ScriptPanel() {
  const { state, dispatch } = useAppContext();
  const [scripts, setScripts] = useState<ScriptDefinition[]>(loadScripts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftName, setDraftName] = useState('');
  const [words, setWords] = useState<ScriptWord[]>([]);
  const [layout, setLayout] = useState<ScriptLayout>('grid');
  const [error, setError] = useState('');
  const [validated, setValidated] = useState(false);

  useEffect(() => saveScripts(scripts), [scripts]);

  const availableAssets = useMemo(
    () => mergeAssetLibraries(state.project.assets, state.sharedAssets),
    [state.project.assets, state.sharedAssets],
  );
  const savedComponents = useMemo(() => {
    const map = new Map<string, SavedComponent>();
    state.favoriteComponents.forEach((favorite) => {
      if (favorite.type === 'saved-element') map.set(favorite.id, favorite);
    });
    state.sharedSavedComponents.forEach((component) => map.set(component.id, component));
    return Array.from(map.values());
  }, [state.favoriteComponents, state.sharedSavedComponents]);

  const validate = () => {
    const nextWords = reconcileScriptWords(draftText, words);
    if (nextWords.length === 0) {
      setError('Add at least one word before validating the script.');
      setValidated(false);
      return;
    }
    const dictionaryByWord = new Map<string, DictionaryEntry>(
      state.dictionaryEntries.map((entry) => [entry.arabicWord.trim().toLocaleLowerCase(), entry]),
    );
    setWords(nextWords.map((word) => {
      if (word.association) return word;
      const dictionaryEntry = dictionaryByWord.get(word.text.toLocaleLowerCase());
      const component = dictionaryEntry?.components[0];
      return component ? { ...word, association: { kind: 'component', component } } : word;
    }));
    setDraftName((name) => name || draftText.trim().slice(0, 42));
    setError('');
    setValidated(true);
  };

  const updateWord = (id: string, association?: ScriptWordAssociation) => {
    setWords((current) => current.map((word) => word.id === id ? { ...word, association } : word));
  };

  const resolveOption = (value: string): ScriptWordAssociation | undefined => {
    if (!value) return undefined;
    if (value === 'ignored') return { kind: 'ignored' };
    if (value === 'text:free') return { kind: 'text', variant: 'free' };
    if (value === 'text:block') return { kind: 'text', variant: 'block' };
    if (value.startsWith('icon:')) return { kind: 'icon', iconName: value.slice(5) };
    if (value.startsWith('asset:')) return { kind: 'asset', assetId: value.slice(6) };
    if (value.startsWith('component:')) {
      const component = savedComponents.find((item) => item.id === value.slice(10));
      return component ? { kind: 'component', component } : undefined;
    }
    if (value.startsWith('dictionary:')) {
      const [, entryId, componentId] = value.split(':');
      const component = state.dictionaryEntries.find((entry) => entry.id === entryId)
        ?.components.find((item) => item.id === componentId);
      return component ? { kind: 'component', component } : undefined;
    }
    return undefined;
  };

  const getOptionValue = (association?: ScriptWordAssociation) => {
    if (!association) return '';
    if (association.kind === 'ignored') return 'ignored';
    if (association.kind === 'text') return `text:${association.variant}`;
    if (association.kind === 'icon') return `icon:${association.iconName}`;
    if (association.kind === 'asset') return `asset:${association.assetId}`;
    const shared = savedComponents.some((item) => item.id === association.component.id);
    if (shared) return `component:${association.component.id}`;
    for (const entry of state.dictionaryEntries) {
      if (entry.components.some((item) => item.id === association.component.id)) {
        return `dictionary:${entry.id}:${association.component.id}`;
      }
    }
    return '';
  };

  const save = () => {
    if (!validated || words.length === 0) return;
    const now = new Date().toISOString();
    const existing = scripts.find((script) => script.id === activeId);
    const next: ScriptDefinition = {
      id: existing?.id || generateId(),
      name: draftName.trim() || 'Untitled Script',
      text: draftText.trim(),
      words,
      layout,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    setScripts((current) => existing
      ? current.map((script) => script.id === existing.id ? next : script)
      : [next, ...current]);
    setActiveId(next.id);
  };

  const generateScene = () => {
    if (!validated || !words.some((word) => word.association?.kind !== 'ignored' && word.association)) {
      setError('Associate at least one word with a component before creating the scene.');
      return;
    }
    const script: ScriptDefinition = {
      id: activeId || generateId(), name: draftName, text: draftText, words, layout,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = buildSceneFromScript(script, availableAssets);
    result.assetsToAdd.forEach((asset) => {
      if (!state.project.assets.some((item) => item.id === asset.id)) {
        dispatch({ type: 'ADD_ASSET', payload: asset });
      }
    });
    dispatch({ type: 'ADD_SCENE', payload: result.scene });
    save();
    setError('');
  };

  const openScript = (script: ScriptDefinition) => {
    setActiveId(script.id);
    setDraftText(script.text);
    setDraftName(script.name);
    setWords(script.words);
    setLayout(script.layout);
    setValidated(true);
    setError('');
  };

  const newScript = () => {
    setActiveId(null); setDraftText(''); setDraftName(''); setWords([]);
    setLayout('grid'); setValidated(false); setError('');
  };

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ScrollText className="h-4 w-4 text-indigo-600" /> Script
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Turn a line into an animated, step-by-step scene.
          </p>
        </div>
        <button onClick={newScript} className="rounded-md bg-indigo-600 p-2 text-white" title="New script">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {scripts.length > 0 && (
        <select
          value={activeId || ''}
          onChange={(event) => {
            const script = scripts.find((item) => item.id === event.target.value);
            if (script) openScript(script);
          }}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
        >
          <option value="">New script</option>
          {scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
        </select>
      )}

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Script name"
          className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400"
        />
        <textarea
          value={draftText}
          onChange={(event) => { setDraftText(event.target.value); setValidated(false); }}
          placeholder="Type your script line…"
          rows={4}
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none focus:border-indigo-500"
        />
        <button onClick={validate} className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white">
          <CheckCircle2 className="h-4 w-4" /> Validate & split words
        </button>
      </div>

      {validated && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Word associations</span><span>{words.filter((word) => word.association).length}/{words.length}</span>
            </div>
            {words.map((word, index) => (
              <div key={word.id} className={`rounded-lg border p-2 ${word.association?.kind === 'ignored' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{word.text}</span>
                  <button
                    onClick={() => updateWord(word.id, word.association?.kind === 'ignored' ? undefined : { kind: 'ignored' })}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title={word.association?.kind === 'ignored' ? 'Restore word' : 'Ignore word'}
                  ><EyeOff className="h-4 w-4" /></button>
                </div>
                <select
                  value={getOptionValue(word.association)}
                  onChange={(event) => updateWord(word.id, resolveOption(event.target.value))}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-700"
                  aria-label={`Component for ${word.text}`}
                >
                  <option value="">{associationLabel()}</option>
                  <option value="ignored">Ignore this word</option>
                  <optgroup label="Text">
                    <option value="text:block">Text block</option>
                    <option value="text:free">Text</option>
                  </optgroup>
                  {savedComponents.length > 0 && <optgroup label="Saved components">
                    {savedComponents.map((component) => <option key={component.id} value={`component:${component.id}`}>{component.name}</option>)}
                  </optgroup>}
                  {state.dictionaryEntries.some((entry) => entry.components.length > 0) && <optgroup label="Dictionary">
                    {state.dictionaryEntries.flatMap((entry) => entry.components.map((component) => (
                      <option key={`${entry.id}:${component.id}`} value={`dictionary:${entry.id}:${component.id}`}>{entry.arabicWord} · {component.name}</option>
                    )))}
                  </optgroup>}
                  {availableAssets.length > 0 && <optgroup label="Images">
                    {availableAssets.map((asset) => <option key={asset.id} value={`asset:${asset.id}`}>{asset.name}</option>)}
                  </optgroup>}
                  <optgroup label="Icons">
                    {FEATURED_ICON_NAMES.slice(0, 36).map((icon) => <option key={icon} value={`icon:${icon}`}>{formatIconName(icon)}</option>)}
                  </optgroup>
                </select>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Smart alignment</div>
            <div className="grid grid-cols-3 gap-2">
              {layoutOptions.map((option) => {
                const Icon = option.icon;
                return <button key={option.value} onClick={() => setLayout(option.value)} className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[9px] font-bold ${layout === option.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                  <Icon className="h-4 w-4" />{option.label}
                </button>;
              })}
            </div>
          </div>
        </>
      )}

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</div>}

      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <button disabled={!validated} onClick={save} className="flex items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40">
          <Save className="h-4 w-4" /> Save
        </button>
        <button disabled={!validated} onClick={generateScene} className="flex items-center justify-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Play className="h-4 w-4" /> Create scene
        </button>
      </div>

      {activeId && <button
        onClick={() => {
          setScripts((current) => current.filter((script) => script.id !== activeId));
          newScript();
        }}
        className="flex w-full items-center justify-center gap-2 text-[10px] font-bold text-rose-500"
      ><Trash2 className="h-3.5 w-3.5" /> Delete script</button>}
    </div>
  );
}
