'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { fetchProjectTopics, fetchGACMQuery, fetchTopicComments, postTopicComment } from '@/lib/gacmApi';
import { GACMQueryResponse } from '@/types/gacm';
import { MessageSquare, Award, Building, Sparkles, Send, Network, ArrowLeft, ShieldAlert } from '@/components/gacm/Icons';

export default function TopicDetailPage() {
  const params = useParams();
  const topicId = params?.id ? Number(params.id) : 1;

  const { user } = useAuth();
  const [topic, setTopic] = useState<any | null>(null);
  const [graphEvidence, setGraphEvidence] = useState<GACMQueryResponse | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    async function loadTopicDetail() {
      setIsLoading(true);
      try {
        const [topics, savedComments] = await Promise.all([
          fetchProjectTopics(),
          fetchTopicComments(topicId)
        ]);
        const found = topics.find((t: any) => t.id === topicId) || topics[0];
        setTopic(found);
        setComments(savedComments || []);

        // Fetch related GACM graph evidence for this topic
        if (found) {
          const res = await fetchGACMQuery(found.title, 3);
          setGraphEvidence(res);
        }
      } catch (err) {
        console.warn('Failed to load topic detail:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTopicDetail();
  }, [topicId]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || isPosting) return;

    setIsPosting(true);
    try {
      await postTopicComment(topicId, {
        author_name: user.username,
        role_label: "Institutional Researcher",
        comment_text: newComment.trim()
      });

      // Refresh comments from PostgreSQL
      const updatedComments = await fetchTopicComments(topicId);
      setComments(updatedComments || []);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment to PostgreSQL:', err);
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center text-navy text-sm font-sans">
        Loading Topic Space Detail & PostgreSQL Discussion Thread...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-navy font-sans py-8 px-4 md:px-8">
      <div className="max-w-[1000px] mx-auto space-y-6">
        
        {/* Back Link */}
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-navy hover:text-amber-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> ← Back to All Project Topics & Spaces
        </Link>

        {/* Topic Header Card */}
        <div className="bg-navy border-b-4 border-gold p-6 text-white shadow-xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wider">
              {topic?.category || 'Research Space'}
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              Topic ID #{topic?.id || 1}
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-gold tracking-tight">
            {topic?.title}
          </h1>

          <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
            {topic?.description}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-white/15 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Faculty Lead / Speaker Panel</span>
              <span className="font-bold text-gold text-sm">{topic?.faculty_lead}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Host Institution</span>
              <span className="font-bold text-white">{topic?.institution}</span>
            </div>
          </div>
        </div>

        {/* Linked GACM Knowledge Graph Evidence */}
        {graphEvidence && graphEvidence.vector_citations && graphEvidence.vector_citations.length > 0 && (
          <div className="bg-white border border-slate-300 p-5 shadow-sm space-y-3 text-xs">
            <h3 className="font-extrabold text-sm text-navy flex items-center gap-2 border-b border-slate-200 pb-2">
              <Network className="w-4 h-4 text-amber-700" /> Linked Knowledge Graph Citations (PostgreSQL + Memgraph)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {graphEvidence.vector_citations.map((cit, idx) => (
                <div key={idx} className="bg-slate-50 p-3.5 border border-slate-200">
                  <h4 className="font-bold text-navy">{cit.project_title}</h4>
                  <p className="text-slate-600 text-[11px] mt-0.5">Faculty: <span className="font-bold text-amber-700">{cit.faculty_name}</span> | Award: ${Number(cit.award_amount).toLocaleString()}</p>
                  <p className="text-slate-500 text-[10px] italic mt-1 font-serif">&ldquo;{cit.abstract_snippet}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discussion Comments Thread (PostgreSQL Persisted) */}
        <div className="bg-white border border-slate-300 p-6 shadow-sm space-y-6">
          <h3 className="font-extrabold text-base text-navy flex items-center gap-2 border-b border-slate-200 pb-3">
            <MessageSquare className="w-5 h-5 text-amber-600" /> PostgreSQL Discussion Thread ({comments.length} Comments)
          </h3>

          {comments.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs italic">
              No discussion comments in PostgreSQL database yet. Be the first to start the conversation!
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-slate-50 p-4 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy">{comment.author_name}</span>
                      <span className="bg-navy/10 text-navy border border-navy/20 text-[9px] font-bold px-2 py-0.5 uppercase">
                        {comment.role_label}
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-800 text-xs leading-relaxed">{comment.comment_text}</p>
                </div>
              ))}
            </div>
          )}

          {/* New Comment Form (Logged-in vs Guest Guardrail) */}
          {user ? (
            <form onSubmit={handleAddComment} className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-navy uppercase tracking-wider">
                <span>Post Discussion Reply to Topic Space</span>
                <span className="text-amber-700 font-mono text-[11px]">Logged in as: {user.username}</span>
              </div>
              <textarea
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share insights, graph queries, or research questions about this topic space..."
                className="w-full bg-white border border-slate-300 p-3 text-xs text-navy placeholder-slate-400 focus:outline-none focus:border-gold"
              />
              <div className="text-right">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isPosting}
                  className="bg-gold text-navy hover:bg-yellow-400 disabled:opacity-50 px-6 py-2.5 font-bold text-xs uppercase tracking-wider transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4 text-navy" /> {isPosting ? 'Saving to Database...' : 'Post Comment'}
                </button>
              </div>
            </form>
          ) : (
            /* Unauthenticated / Guest User Guardrail Banner */
            <div className="pt-4 border-t border-slate-200 bg-amber-50 border border-amber-300 p-4 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-amber-900 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Authentication Required to Join Discussion</span>
              </div>
              <p className="text-xs text-amber-800 max-w-md mx-auto">
                Only logged-in institutional users can post discussion comments and save GACM AI query history to the PostgreSQL database.
              </p>
              <div className="pt-1">
                <Link
                  href="/login"
                  className="inline-block bg-navy text-gold hover:bg-slate-800 px-6 py-2.5 font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Log In Now to Post Comment →
                </Link>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
