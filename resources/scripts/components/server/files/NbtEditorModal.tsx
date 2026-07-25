import React, { useCallback, useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import Spinner from '@/components/elements/Spinner';
import http from '@/api/http';
import {
    NbtNamedTag,
    NbtCompound,
    NbtTagValue,
    parseNbtFile,
    writeNbtFile,
    compoundToPlainJson,
    mergeEdits,
} from '@/components/server/nbtUtils';

// ---- Type metadata ----

const TYPE_META: Record<string, { color: string; label: string }> = {
    byte: { color: '#fb923c', label: 'Byte' },
    short: { color: '#fb923c', label: 'Short' },
    int: { color: '#f97316', label: 'Int' },
    long: { color: '#f97316', label: 'Long' },
    float: { color: '#22d3ee', label: 'Float' },
    double: { color: '#22d3ee', label: 'Double' },
    string: { color: '#86efac', label: 'String' },
    byteArray: { color: '#a78bfa', label: 'Byte[]' },
    intArray: { color: '#a78bfa', label: 'Int[]' },
    longArray: { color: '#a78bfa', label: 'Long[]' },
    list: { color: '#e879f9', label: 'List' },
    compound: { color: '#60a5fa', label: 'Compound' },
    end: { color: '#6b7280', label: 'End' },
};

function getMeta(type: string) {
    return TYPE_META[type] ?? { color: '#9ca3af', label: type };
}

// ---- Syntax-highlighted JSON ----

function highlightJson(json: string): React.ReactNode[] {
    const tokens: React.ReactNode[] = [];
    const re =
        /("(?:\\.|[^"\\])*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = re.exec(json)) !== null) {
        if (match.index > last) {
            tokens.push(
                <span key={`ws-${i++}`} style={{ color: '#4b5563' }}>
                    {json.slice(last, match.index)}
                </span>,
            );
        }

        const [full, str, colon, keyword, number, punct] = match;

        if (str) {
            if (colon) {
                tokens.push(
                    <span key={`k-${i++}`} style={{ color: '#93c5fd' }}>
                        {str}
                    </span>,
                );
                tokens.push(
                    <span key={`c-${i++}`} style={{ color: '#6b7280' }}>
                        :
                    </span>,
                );
            } else {
                tokens.push(
                    <span key={`s-${i++}`} style={{ color: '#86efac' }}>
                        {str}
                    </span>,
                );
            }
        } else if (keyword) {
            tokens.push(
                <span
                    key={`kw-${i++}`}
                    style={{ color: keyword === 'null' ? '#9ca3af' : '#f97316' }}
                >
                    {keyword}
                </span>,
            );
        } else if (number) {
            tokens.push(
                <span key={`n-${i++}`} style={{ color: '#fb923c' }}>
                    {number}
                </span>,
            );
        } else if (punct) {
            tokens.push(
                <span key={`p-${i++}`} style={{ color: '#6b7280' }}>
                    {punct}
                </span>,
            );
        }

        last = match.index + full.length;
    }

    if (last < json.length) {
        tokens.push(
            <span key={`tail-${i++}`} style={{ color: '#4b5563' }}>
                {json.slice(last)}
            </span>,
        );
    }

    return tokens;
}

const JsonView = ({ text, onChange }: { text: string; onChange: (v: string) => void }) => {
    const [editing, setEditing] = useState(false);
    const taRef = useRef<HTMLTextAreaElement>(null);

    const startEdit = () => {
        setEditing(true);
        setTimeout(() => taRef.current?.focus(), 0);
    };

    if (editing) {
        return (
            <textarea
                ref={taRef}
                value={text}
                onChange={e => onChange(e.target.value)}
                onBlur={() => setEditing(false)}
                spellCheck={false}
                style={{
                    width: '100%',
                    minHeight: '400px',
                    height: '100%',
                    background: 'transparent',
                    color: '#e2e8f0',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    lineHeight: '1.6',
                    padding: '16px',
                    resize: 'none',
                    outline: 'none',
                    border: 'none',
                    caretColor: '#a78bfa',
                }}
            />
        );
    }

    return (
        <pre
            onClick={startEdit}
            title={'Click to edit'}
            style={{
                margin: 0,
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                lineHeight: '1.6',
                cursor: 'text',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                minHeight: '400px',
            }}
        >
            {highlightJson(text)}
        </pre>
    );
};

// ---- Editable leaf value ----

const EditableValue = ({
    value,
    type,
    path,
    onEdit,
}: {
    value: any;
    type: string;
    path: string;
    onEdit: (path: string, type: string, value: any) => void;
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const { color } = getMeta(type);
    const isNumeric = ['byte', 'short', 'int', 'long', 'float', 'double'].includes(type);
    const isArray = ['byteArray', 'intArray', 'longArray'].includes(type);

    const startEdit = () => {
        if (isArray) return; // arrays are rendered as expandable list nodes instead
        setDraft(String(value));
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const commit = () => {
        setEditing(false);
        try {
            const parsed = isNumeric ? Number(draft) : draft;
            if (isNumeric && isNaN(parsed as number)) return;
            onEdit(path, type, parsed);
        } catch {
            // ignore
        }
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(false);
                }}
                style={{
                    background: '#0f0f1a',
                    border: `1px solid ${color}`,
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '1px 6px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    minWidth: '60px',
                    maxWidth: '320px',
                    width: `${Math.max(60, draft.length * 8)}px`,
                }}
            />
        );
    }

    const display = isArray
        ? `[${(value as any[]).length} entries]`
        : type === 'string'
        ? `"${String(value).length > 80 ? String(value).slice(0, 80) + '…' : value}"`
        : String(value).length > 80
        ? String(value).slice(0, 80) + '…'
        : String(value);

    return (
        <span
            onClick={isArray ? undefined : startEdit}
            title={isArray ? undefined : 'Click to edit'}
            style={{
                color,
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                cursor: isArray ? 'default' : 'text',
                padding: '0 3px',
                borderRadius: '3px',
                transition: 'background 0.1s',
            }}
            onMouseEnter={e => {
                if (!isArray) e.currentTarget.style.background = 'rgba(124,58,237,0.18)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
            }}
        >
            {display}
        </span>
    );
};

// ---- Tree node ----

interface TreeNodeProps {
    name: string;
    tag: NbtTagValue;
    depth: number;
    path: string;
    isLast: boolean;
    onEdit: (path: string, type: string, value: any) => void;
}

const INDENT = 20;
const GUIDE_COLOR = 'rgba(255,255,255,0.07)';

const TypeBadge = ({ type }: { type: string }) => {
    const meta = getMeta(type);
    return (
        <span
            style={{
                background: meta.color + '22',
                color: meta.color,
                borderRadius: '3px',
                fontSize: '0.58rem',
                fontWeight: 800,
                padding: '1px 4px',
                fontFamily: 'monospace',
                letterSpacing: '0.03em',
                flexShrink: 0,
                border: `1px solid ${meta.color}44`,
            }}
        >
            {meta.label}
        </span>
    );
};

const TreeNode = ({ name, tag, depth, path, isLast: _isLast, onEdit }: TreeNodeProps) => {
    const [open, setOpen] = useState(depth < 2);
    const isCompound = tag.type === 'compound';
    const isList = tag.type === 'list';

    const rowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px 2px 0',
        borderRadius: '4px',
        cursor: isCompound || isList ? 'pointer' : 'default',
        position: 'relative',
        marginLeft: `${depth * INDENT}px`,
    };

    if (isCompound) {
        const children = Object.entries(tag.value as NbtCompound);
        return (
            <div>
                <div
                    style={rowStyle}
                    onClick={() => setOpen(o => !o)}
                    onMouseEnter={e =>
                        ((e.currentTarget as HTMLElement).style.background =
                            'rgba(255,255,255,0.04)')
                    }
                    onMouseLeave={e =>
                        ((e.currentTarget as HTMLElement).style.background = 'transparent')
                    }
                >
                    {depth > 0 && (
                        <span
                            style={{
                                position: 'absolute',
                                left: `-${INDENT - 10}px`,
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: GUIDE_COLOR,
                            }}
                        />
                    )}
                    <span
                        style={{
                            color: '#6b7280',
                            fontSize: '0.55rem',
                            width: '10px',
                            flexShrink: 0,
                            textAlign: 'center',
                        }}
                    >
                        {open ? '▼' : '▶'}
                    </span>
                    <TypeBadge type={tag.type} />
                    <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>
                        {name}
                    </span>
                    <span style={{ color: '#374151', fontSize: '0.7rem' }}>
                        {children.length} {children.length === 1 ? 'entry' : 'entries'}
                    </span>
                </div>
                {open && (
                    <div style={{ position: 'relative' }}>
                        <span
                            style={{
                                position: 'absolute',
                                left: `${depth * INDENT + 9}px`,
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: GUIDE_COLOR,
                            }}
                        />
                        {children.map(([k, v], i) => (
                            <TreeNode
                                key={k}
                                name={k}
                                tag={v}
                                depth={depth + 1}
                                path={`${path}.${k}`}
                                isLast={i === children.length - 1}
                                onEdit={onEdit}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (isList) {
        const listVal = tag.value as { type: string; value: any[] };
        const items: any[] = listVal.value ?? [];
        const itemType = listVal.type;
        const itemMeta = getMeta(itemType);
        return (
            <div>
                <div
                    style={rowStyle}
                    onClick={() => setOpen(o => !o)}
                    onMouseEnter={e =>
                        ((e.currentTarget as HTMLElement).style.background =
                            'rgba(255,255,255,0.04)')
                    }
                    onMouseLeave={e =>
                        ((e.currentTarget as HTMLElement).style.background = 'transparent')
                    }
                >
                    {depth > 0 && (
                        <span
                            style={{
                                position: 'absolute',
                                left: `-${INDENT - 10}px`,
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: GUIDE_COLOR,
                            }}
                        />
                    )}
                    <span
                        style={{
                            color: '#6b7280',
                            fontSize: '0.55rem',
                            width: '10px',
                            flexShrink: 0,
                            textAlign: 'center',
                        }}
                    >
                        {open ? '▼' : '▶'}
                    </span>
                    <TypeBadge type={'list'} />
                    <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>
                        {name}
                    </span>
                    <span style={{ color: '#374151', fontSize: '0.7rem' }}>
                        {items.length} ×{' '}
                        <span style={{ color: itemMeta.color }}>{itemMeta.label}</span>
                    </span>
                </div>
                {open && (
                    <div style={{ position: 'relative' }}>
                        <span
                            style={{
                                position: 'absolute',
                                left: `${depth * INDENT + 9}px`,
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: GUIDE_COLOR,
                            }}
                        />
                        {items.map((item, i) => (
                            <TreeNode
                                key={i}
                                name={`[${i}]`}
                                tag={
                                    itemType === 'compound'
                                        ? { type: 'compound', value: item }
                                        : { type: itemType, value: item }
                                }
                                depth={depth + 1}
                                path={`${path}[${i}]`}
                                isLast={i === items.length - 1}
                                onEdit={onEdit}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Primitive arrays — render as expandable indexed list
    const isArrayType = tag.type === 'byteArray' || tag.type === 'intArray' || tag.type === 'longArray';
    if (isArrayType) {
        const items: any[] = Array.isArray(tag.value) ? tag.value : [];
        const itemType = tag.type === 'byteArray' ? 'byte' : tag.type === 'longArray' ? 'long' : 'int';
        return (
            <div>
                <div
                    style={rowStyle}
                    onClick={() => setOpen(o => !o)}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                    {depth > 0 && (
                        <span style={{ position: 'absolute', left: `-${INDENT - 10}px`, top: 0, bottom: 0, width: '1px', background: GUIDE_COLOR }} />
                    )}
                    <span style={{ color: '#6b7280', fontSize: '0.55rem', width: '10px', flexShrink: 0, textAlign: 'center' }}>
                        {open ? '▼' : '▶'}
                    </span>
                    <TypeBadge type={tag.type} />
                    <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>{name}</span>
                    <span style={{ color: '#374151', fontSize: '0.7rem' }}>{items.length} entries</span>
                </div>
                {open && (
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: `${depth * INDENT + 9}px`, top: 0, bottom: 0, width: '1px', background: GUIDE_COLOR }} />
                        {items.map((item, i) => (
                            <TreeNode
                                key={i}
                                name={`[${i}]`}
                                tag={{ type: itemType, value: item }}
                                depth={depth + 1}
                                path={`${path}[${i}]`}
                                isLast={i === items.length - 1}
                                onEdit={onEdit}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            style={rowStyle}
            onMouseEnter={e =>
                ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)')
            }
            onMouseLeave={e =>
                ((e.currentTarget as HTMLElement).style.background = 'transparent')
            }
        >
            {depth > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        left: `-${INDENT - 10}px`,
                        top: 0,
                        bottom: 0,
                        width: '1px',
                        background: GUIDE_COLOR,
                    }}
                />
            )}
            <span style={{ width: '10px', flexShrink: 0 }} />
            <TypeBadge type={tag.type} />
            <span
                style={{
                    color: '#cbd5e1',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    minWidth: '80px',
                }}
            >
                {name}
            </span>
            <span style={{ color: '#374151', fontSize: '0.7rem' }}>=</span>
            <EditableValue value={tag.value} type={tag.type} path={path} onEdit={onEdit} />
        </div>
    );
};

// ---- Main modal ----

interface Props {
    filePath: string;
    onClose: () => void;
}

type Mode = 'tree' | 'json';

export default ({ filePath, onClose }: Props) => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [mode, setMode] = useState<Mode>('tree');
    const [nbtTree, setNbtTree] = useState<NbtNamedTag | null>(null);
    const [jsonText, setJsonText] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);

    const fileName = filePath.split('/').pop() ?? filePath;

    useEffect(() => {
        setLoading(true);
        setError(null);
        getFileDownloadUrl(uuid, filePath)
            .then(url => fetch(url))
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then(buf => parseNbtFile(buf))
            .then(parsed => {
                setNbtTree(parsed);
                setJsonText(JSON.stringify(compoundToPlainJson(parsed.value), null, 2));
            })
            .catch(e => setError(e?.message ?? 'Failed to load file'))
            .finally(() => setLoading(false));
    }, [filePath]);

    const handleTreeEdit = useCallback(
        (path: string, _type: string, value: any) => {
            setNbtTree(prev => {
                if (!prev) return prev;
                const cloned = JSON.parse(JSON.stringify(prev)) as NbtNamedTag;

                const tokenRe = /\.([^.[]+)(?:\[(\d+)\])?/g;
                const tokens: Array<{ key: string; idx: number | undefined }> = [];
                let tm: RegExpExecArray | null;
                while ((tm = tokenRe.exec(path)) !== null) {
                    tokens.push({
                        key: tm[1],
                        idx: tm[2] !== undefined ? parseInt(tm[2]) : undefined,
                    });
                }

                let node: any = cloned.value;
                for (let i = 0; i < tokens.length - 1; i++) {
                    const { key, idx } = tokens[i];
                    const tag = node[key];
                    if (!tag) return prev;
                    if (idx !== undefined) {
                        if (tag && Array.isArray(tag.value)) {
                            // intArray/byteArray/longArray — plain array, item is a scalar
                            node = tag.value;
                        } else {
                            const listInner = tag.value as { type: string; value: any[] };
                            const item = listInner.value[idx];
                            node =
                                typeof item === 'object' && item !== null && !Array.isArray(item)
                                    ? item
                                    : listInner.value;
                        }
                    } else {
                        node = tag.value;
                    }
                }

                const { key: lastKey, idx: lastIdx } = tokens[tokens.length - 1];
                if (lastIdx !== undefined) {
                    const tag = node[lastKey];
                    // Could be a list wrapper { type, value: [] } or a plain array (intArray/byteArray/longArray)
                    if (tag && tag.value && typeof tag.value === 'object' && 'value' in tag.value && Array.isArray(tag.value.value)) {
                        // list<T> — { type, value: { type: itemType, value: [] } }
                        (tag.value as { type: string; value: any[] }).value[lastIdx] = value;
                    } else if (tag && Array.isArray(tag.value)) {
                        // intArray / byteArray / longArray — plain array
                        tag.value[lastIdx] = value;
                    }
                } else {
                    if (!node[lastKey]) return prev;
                    node[lastKey].value = value;
                }

                setJsonText(JSON.stringify(compoundToPlainJson(cloned.value), null, 2));
                return cloned;
            });
        },
        [],
    );

    const switchToJson = () => {
        if (nbtTree) setJsonText(JSON.stringify(compoundToPlainJson(nbtTree.value), null, 2));
        setJsonError(null);
        setMode('json');
    };

    const switchToTree = () => {
        if (!nbtTree) return;
        try {
            const parsed = JSON.parse(jsonText);
            setNbtTree({ ...nbtTree, value: mergeEdits(nbtTree.value, parsed) });
            setJsonError(null);
        } catch (e: any) {
            setJsonError('Invalid JSON: ' + e.message);
            return;
        }
        setMode('tree');
    };

    const save = async () => {
        if (!nbtTree) return;
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            let tree = nbtTree;
            if (mode === 'json') {
                const parsed = JSON.parse(jsonText);
                tree = { ...nbtTree, value: mergeEdits(nbtTree.value, parsed) };
                setNbtTree(tree);
            }
            const compressed = writeNbtFile(tree);
            const blob = new Blob(
                [
                    compressed.buffer.slice(
                        compressed.byteOffset,
                        compressed.byteOffset + compressed.byteLength,
                    ) as ArrayBuffer,
                ],
                { type: 'application/octet-stream' },
            );
            await http.post(`/api/client/servers/${uuid}/files/write`, blob, {
                params: { file: filePath },
                headers: { 'Content-Type': 'application/octet-stream' },
            });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e: any) {
            setSaveError(e?.message ?? 'Failed to save file');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div css={tw`fixed inset-0 bg-black bg-opacity-75 z-40`} onClick={onClose} />
            <div
                css={tw`fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4`}
                style={{ top: '3.5rem' }}
                onClick={onClose}
            >
                <div
                    css={tw`bg-neutral-900 border border-neutral-700 rounded-xl w-full shadow-2xl flex flex-col`}
                    style={{ maxHeight: 'calc(100vh - 5rem)', maxWidth: '900px' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div css={tw`flex items-center justify-between px-5 py-3.5 border-b border-neutral-700 flex-shrink-0`}>
                        <div css={tw`flex items-center gap-2 min-w-0`}>
                            <span css={tw`text-xs font-semibold uppercase tracking-widest text-neutral-500`}>
                                NBT Editor
                            </span>
                            <span css={tw`text-neutral-700`}>/</span>
                            <span css={tw`text-neutral-200 font-mono text-sm truncate`}>
                                {fileName}
                            </span>
                        </div>
                        <div css={tw`flex items-center gap-2 flex-shrink-0`}>
                            <div css={tw`flex bg-neutral-800 rounded-lg p-0.5 border border-neutral-700`}>
                                <button
                                    onClick={() => (mode === 'json' ? switchToTree() : undefined)}
                                    css={[
                                        tw`px-3 py-1 text-xs font-medium rounded-md transition-colors`,
                                        mode === 'tree'
                                            ? tw`bg-purple-700 text-white`
                                            : tw`text-neutral-400 hover:text-neutral-200`,
                                    ]}
                                >
                                    Tree
                                </button>
                                <button
                                    onClick={() => (mode === 'tree' ? switchToJson() : undefined)}
                                    css={[
                                        tw`px-3 py-1 text-xs font-medium rounded-md transition-colors`,
                                        mode === 'json'
                                            ? tw`bg-purple-700 text-white`
                                            : tw`text-neutral-400 hover:text-neutral-200`,
                                    ]}
                                >
                                    JSON
                                </button>
                            </div>
                            <button
                                onClick={save}
                                disabled={saving || loading}
                                css={[
                                    tw`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors`,
                                    saving || loading
                                        ? tw`bg-neutral-700 text-neutral-500 cursor-not-allowed`
                                        : saveSuccess
                                        ? tw`bg-green-700 text-green-100`
                                        : tw`bg-purple-700 hover:bg-purple-600 text-white`,
                                ]}
                            >
                                {saving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save .dat'}
                            </button>
                            <button
                                onClick={onClose}
                                css={tw`text-neutral-500 hover:text-neutral-200 text-xl leading-none px-1`}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {(saveError || jsonError) && (
                        <div css={tw`mx-5 mt-3 px-3 py-2 bg-red-900 bg-opacity-40 border border-red-700 rounded-lg text-red-300 text-sm flex-shrink-0`}>
                            {saveError || jsonError}
                        </div>
                    )}

                    <div
                        css={tw`flex-1 overflow-y-auto`}
                        style={{ minHeight: 0, background: '#111118' }}
                    >
                        {loading ? (
                            <div css={tw`flex items-center justify-center py-20`}>
                                <Spinner size={'large'} centered />
                            </div>
                        ) : error ? (
                            <div css={tw`text-center py-16`}>
                                <p css={tw`text-red-400 font-medium mb-1`}>Failed to load file</p>
                                <p css={tw`text-neutral-500 text-sm`}>{error}</p>
                            </div>
                        ) : mode === 'tree' ? (
                            <div style={{ padding: '12px 8px 12px 20px' }}>
                                {nbtTree &&
                                    Object.entries(nbtTree.value).map(([k, v], i, arr) => (
                                        <TreeNode
                                            key={k}
                                            name={k}
                                            tag={v}
                                            depth={0}
                                            path={`.${k}`}
                                            isLast={i === arr.length - 1}
                                            onEdit={handleTreeEdit}
                                        />
                                    ))}
                            </div>
                        ) : (
                            <JsonView text={jsonText} onChange={setJsonText} />
                        )}
                    </div>

                    <div css={tw`px-5 py-2 border-t border-neutral-800 flex items-center justify-between flex-shrink-0`}>
                        <p css={tw`text-xs text-neutral-600`}>
                            {mode === 'tree'
                                ? 'Click any value to edit inline · Click a compound/list to collapse it'
                                : 'Click anywhere to edit · Switch to Tree to validate changes'}
                        </p>
                        {mode === 'json' && (
                            <p css={tw`text-xs text-neutral-600`}>
                                Types are preserved from the original NBT
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};