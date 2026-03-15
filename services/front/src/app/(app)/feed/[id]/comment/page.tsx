"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { getComment, listComments, createComment } from '@/lib/agent';
import { likeContent, unlikeContent } from '@/lib/ballots';
import { formatRelativeTime } from '@/lib/utils';
import type { CommentWithMetadata } from '@/types/ballots';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/spinner';
import { ProContraBadge } from '@/components/pro-contra-badge';
import { CantonAvatar, BskyAvatar } from '@/components/canton-avatar';
import { ReplyInput } from '@/components/reply-input';

// ---------------------------------------------------------------------------
// Thread helpers
// ---------------------------------------------------------------------------

function buildAncestorChain(
  commentMap: Map<string, CommentWithMetadata>,
  focalUri: string,
): CommentWithMetadata[] {
  const chain: CommentWithMetadata[] = [];
  let current = commentMap.get(focalUri);
  while (current?.parentUri) {
    const parent = commentMap.get(current.parentUri);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Comment node (recursive)
// ---------------------------------------------------------------------------

function CommentNode({
  comment,
  depth,
  onLikeToggle,
  onReply,
  onNavigate,
}: {
  comment: CommentWithMetadata;
  depth: number;
  onLikeToggle: (c: CommentWithMetadata) => void;
  onReply: (parentUri: string) => void;
  onNavigate: (uri: string) => void;
}) {
  const tc = useTranslations('common');
  const indent = typeof window !== 'undefined' && window.innerWidth < 640 ? 16 : 24;
  const isExtern = comment.origin === 'extern';
  const liked = !!comment.viewer?.like;

  return (
    <div style={{ paddingLeft: depth > 0 ? indent : 0 }}>
      <div
        onClick={() => onNavigate(comment.uri)}
        className="flex gap-2 pt-2.5 pb-1.5 cursor-pointer"
        style={{
          borderLeft: depth > 0 ? '2px solid #e0e0e0' : 'none',
          paddingLeft: depth > 0 ? 10 : 0,
        }}
      >
        {isExtern
          ? <BskyAvatar size={28} />
          : <CantonAvatar canton={comment.author.canton} color={comment.author.color} size={28} />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {isExtern
                ? (comment.author.handle || comment.author.displayName || tc('bluesky'))
                : (comment.author.displayName || tc('anonymous'))}
            </span>
            {isExtern && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tc('bluesky')}</Badge>
            )}
            <span>{comment.record.createdAt ? formatRelativeTime(comment.record.createdAt) : ''}</span>
          </div>
          <div className="text-sm leading-normal mt-0.5">
            {comment.record.body}
          </div>
          <div className="flex gap-3.5 mt-1 text-xs text-muted-foreground">
            <button
              onClick={(e) => { e.stopPropagation(); onLikeToggle(comment); }}
              className="bg-transparent border-none p-0 cursor-pointer text-xs"
              style={{ color: liked ? 'var(--brand)' : '#8e8e8e' }}
            >
              {liked ? '\u2764' : '\u2661'} {(comment.likeCount ?? 0) > 0 ? comment.likeCount : ''}
            </button>
            {!isExtern && (
              <button
                onClick={(e) => { e.stopPropagation(); onReply(comment.uri); }}
                className="bg-transparent border-none p-0 cursor-pointer text-xs text-muted-foreground"
              >
                {'\ud83d\udcac'} {tc('reply')}
              </button>
            )}
          </div>
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((r) => (
            <CommentNode
              key={r.uri}
              comment={r}
              depth={Math.min(depth + 1, 2)}
              onLikeToggle={onLikeToggle}
              onReply={onReply}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument context box
// ---------------------------------------------------------------------------

function ArgumentContextBox({
  title,
  type,
  likeCount,
  commentCount,
}: {
  title: string;
  type?: 'PRO' | 'CONTRA';
  likeCount?: number;
  commentCount?: number;
}) {
  return (
    <div className="bg-muted px-3 py-2 mb-4 rounded-r" style={{ borderLeft: '3px solid #4a90e2' }}>
      <div className="flex items-center gap-2">
        <span className="font-bold text-xs flex-1">{title}</span>
        {type && <ProContraBadge type={type.toLowerCase()} variant="soft" />}
      </div>
      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
        {likeCount !== undefined && <span>{'\u2661'} {likeCount}</span>}
        {commentCount !== undefined && <span>{'\ud83d\udcac'} {commentCount}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact ancestor strip
// ---------------------------------------------------------------------------

function AncestorStrip({ comment, indent, onNavigate }: { comment: CommentWithMetadata; indent: number; onNavigate: (uri: string) => void }) {
  const tc = useTranslations('common');
  const isExtern = comment.origin === 'extern';
  const truncated = comment.record.body.length > 80
    ? comment.record.body.slice(0, 80) + '...'
    : comment.record.body;

  return (
    <div style={{ paddingLeft: indent, paddingTop: 6, paddingBottom: 6 }}>
      <div
        onClick={() => onNavigate(comment.uri)}
        className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs text-muted-foreground cursor-pointer"
      >
        {isExtern
          ? <BskyAvatar size={20} />
          : <CantonAvatar canton={comment.author.canton} color={comment.author.color} size={20} />
        }
        <span className="font-semibold text-foreground whitespace-nowrap">
          {isExtern
            ? (comment.author.handle || comment.author.displayName || tc('bluesky'))
            : (comment.author.displayName || tc('anonymous'))}:
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
          {truncated}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument info type
// ---------------------------------------------------------------------------

type ArgumentInfo = {
  uri: string;
  rkey: string;
  title: string;
  body?: string;
  type?: 'PRO' | 'CONTRA';
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: string;
  ballotRkey: string;
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CommentDetailPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const commentUri = searchParams.get('uri') ?? '';
  const t = useTranslations('commentDetail');
  const tc = useTranslations('common');

  const [focalComment, setFocalComment] = useState<CommentWithMetadata | null>(null);
  const [argument, setArgument] = useState<ArgumentInfo | null>(null);
  const [directReplies, setDirectReplies] = useState<CommentWithMetadata[]>([]);
  const [ancestors, setAncestors] = useState<CommentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !commentUri) return;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const { comment, argument: arg } = await getComment(commentUri);
        const allCmts = await listComments(arg.uri);

        const commentMap = new Map<string, CommentWithMetadata>();
        for (const c of allCmts) {
          commentMap.set(c.uri, { ...c, replies: [] });
        }
        if (!commentMap.has(comment.uri)) {
          commentMap.set(comment.uri, { ...comment, replies: [] });
        }

        for (const c of allCmts) {
          if (c.parentUri && commentMap.has(c.parentUri)) {
            commentMap.get(c.parentUri)!.replies!.push(commentMap.get(c.uri)!);
          }
        }

        const chain = buildAncestorChain(commentMap, comment.uri);
        const replies = allCmts
          .filter(c => c.parentUri === comment.uri)
          .map(c => commentMap.get(c.uri)!);

        setFocalComment(comment);
        setArgument(arg);
        setAncestors(chain);
        setDirectReplies(replies);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comment');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authLoading, commentUri]);

  const handleLikeToggle = useCallback(async (c: CommentWithMetadata) => {
    const liked = !!c.viewer?.like;

    if (c.uri === focalComment?.uri) {
      setFocalComment(prev => prev ? {
        ...prev,
        likeCount: (prev.likeCount ?? 0) + (liked ? -1 : 1),
        viewer: liked ? undefined : { like: '__pending__' },
      } : prev);
    } else {
      setDirectReplies(prev => prev.map(r =>
        r.uri === c.uri
          ? { ...r, likeCount: (r.likeCount ?? 0) + (liked ? -1 : 1), viewer: liked ? undefined : { like: '__pending__' } }
          : r
      ));
    }

    try {
      if (liked) {
        await unlikeContent(c.viewer!.like!);
        if (c.uri === focalComment?.uri) {
          setFocalComment(prev => prev ? { ...prev, viewer: undefined } : prev);
        } else {
          setDirectReplies(prev => prev.map(r => r.uri === c.uri ? { ...r, viewer: undefined } : r));
        }
      } else {
        const likeUri = await likeContent(c.uri, c.cid);
        if (c.uri === focalComment?.uri) {
          setFocalComment(prev => prev ? { ...prev, viewer: { like: likeUri } } : prev);
        } else {
          setDirectReplies(prev => prev.map(r => r.uri === c.uri ? { ...r, viewer: { like: likeUri } } : r));
        }
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      if (c.uri === focalComment?.uri) {
        setFocalComment(prev => prev ? {
          ...prev,
          likeCount: (prev.likeCount ?? 0) + (liked ? 1 : -1),
          viewer: liked ? { like: c.viewer!.like! } : undefined,
        } : prev);
      } else {
        setDirectReplies(prev => prev.map(r =>
          r.uri === c.uri
            ? { ...r, likeCount: (r.likeCount ?? 0) + (liked ? 1 : -1), viewer: liked ? { like: c.viewer!.like! } : undefined }
            : r
        ));
      }
    }
  }, [focalComment]);

  const handleNavigateToComment = useCallback((uri: string) => {
    router.push(`/feed/${id}/comment?uri=${encodeURIComponent(uri)}`);
  }, [id, router]);

  const handleReply = useCallback(() => {
    replyInputRef.current?.focus();
  }, []);

  const handleSubmitReply = useCallback(async () => {
    if (!replyText.trim() || submitting || !focalComment || !argument) return;
    setSubmitting(true);
    try {
      await createComment(argument.uri, '', replyText.trim(), focalComment.uri);
      setReplyText('');
      const allCmts = await listComments(argument.uri);
      const commentMap = new Map<string, CommentWithMetadata>();
      for (const c of allCmts) {
        commentMap.set(c.uri, { ...c, replies: [] });
      }
      for (const c of allCmts) {
        if (c.parentUri && commentMap.has(c.parentUri)) {
          commentMap.get(c.parentUri)!.replies!.push(commentMap.get(c.uri)!);
        }
      }
      const replies = allCmts
        .filter(c => c.parentUri === focalComment.uri)
        .map(c => commentMap.get(c.uri)!);
      setDirectReplies(replies);
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setSubmitting(false);
    }
  }, [replyText, submitting, focalComment, argument]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc('restoringSession')}</span>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button variant="outline" size="sm" onClick={() => router.push(`/feed/${id}`)}>
        &larr; {t('backToFeed')}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription><strong>{tc('error')}:</strong> {error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t('loadingComment')}</span>
          </CardContent>
        </Card>
      )}

      {!loading && focalComment && argument && (
        <>
          <ArgumentContextBox
            title={argument.title}
            type={argument.type}
            likeCount={argument.likeCount}
            commentCount={argument.commentCount}
          />

          <Card>
            <CardContent className="pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b pb-2">
                {t('thread')}
              </div>

              {ancestors.map((ancestor, idx) => (
                <AncestorStrip key={ancestor.uri} comment={ancestor} indent={idx * 16} onNavigate={handleNavigateToComment} />
              ))}

              <div style={{
                paddingLeft: ancestors.length * 16,
                paddingTop: ancestors.length > 0 ? 4 : 0,
              }}>
                <div className="bg-card rounded-r-lg shadow-md px-4 py-3" style={{ borderLeft: '3px solid #1565c0' }}>
                  <div className="flex items-center gap-2 mb-2">
                    {focalComment.origin === 'extern'
                      ? <BskyAvatar size={32} />
                      : <CantonAvatar canton={focalComment.author.canton} color={focalComment.author.color} size={32} />
                    }
                    <div>
                      <div className="font-semibold text-sm">
                        {focalComment.origin === 'extern'
                          ? (focalComment.author.handle || focalComment.author.displayName || tc('bluesky'))
                          : (focalComment.author.displayName || tc('anonymous'))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {focalComment.record.createdAt ? formatRelativeTime(focalComment.record.createdAt) : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm leading-relaxed mb-2.5">
                    {focalComment.record.body}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <button
                      onClick={() => handleLikeToggle(focalComment)}
                      className="bg-transparent border-none p-0 cursor-pointer text-xs"
                      style={{ color: focalComment.viewer?.like ? '#d81b60' : '#8e8e8e' }}
                    >
                      {focalComment.viewer?.like ? '\u2764' : '\u2661'}{' '}
                      {(focalComment.likeCount ?? 0) > 0 ? focalComment.likeCount : ''}
                    </button>
                    <button
                      onClick={handleReply}
                      className="bg-transparent border-none p-0 cursor-pointer text-xs text-primary font-semibold"
                    >
                      {'\ud83d\udcac'} {tc('reply')}
                    </button>
                  </div>
                </div>

                {directReplies.length > 0 && (
                  <div className="mt-2 pl-4">
                    {directReplies.map((reply) => (
                      <CommentNode
                        key={reply.uri}
                        comment={reply}
                        depth={0}
                        onLikeToggle={handleLikeToggle}
                        onReply={handleReply}
                        onNavigate={handleNavigateToComment}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1.5">{t('replyToComment')}</div>
              <ReplyInput
                ref={replyInputRef}
                value={replyText}
                onChange={setReplyText}
                onSubmit={handleSubmitReply}
                submitting={submitting}
                placeholder={t('replyPlaceholder')}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
