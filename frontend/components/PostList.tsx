'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Post, PaginatedPostsResponse } from '@/types';
import { apiFetch } from '@/lib/api';

interface PostListProps {
  initialData: PaginatedPostsResponse;
  apiEndpoint: string;
}

export default function PostList({ initialData, apiEndpoint }: PostListProps) {
  const [posts, setPosts] = useState<Post[]>(initialData.posts);
  const [hasMore, setHasMore] = useState(initialData.has_more);
  const [skip, setSkip] = useState(initialData.posts.length);
  const limit = initialData.limit;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMorePosts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      type ApiPost = Omit<Post, 'created_at'> & { date_posted?: string };
      type ApiPaginatedResponse = Omit<PaginatedPostsResponse, 'posts'> & { posts: ApiPost[] };

      const data = await apiFetch<ApiPaginatedResponse>(`${apiEndpoint}?skip=${skip}&limit=${limit}`, { skipAuth: true });
      
      const newPosts = data.posts.map(p => ({
        ...p,
        created_at: p.date_posted || (p as unknown as Post).created_at
      })) as Post[];

      setPosts((prevPosts) => [...prevPosts, ...newPosts]);
      setSkip((prevSkip) => prevSkip + newPosts.length);
      setHasMore(data.has_more);
    } catch (err: unknown) {
      console.error('Error loading posts:', err);
      setError('ERROR - CLICK TO RETRY');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div id="postsContainer" className="space-y-4">
        {posts.length > 0 ? (
          posts.map((post) => (
            <article key={post.id} className="glass-card p-6 transition-all duration-300 hover:border-cyan-400/35 hover:shadow-[0_8px_30px_rgba(14,165,233,0.15)] group">
              <div className="flex items-start gap-4">
                
                {/* Profile Avatar */}
                {post.author.image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    className="rounded-full shrink-0 border border-cyan-500/30 object-cover h-11 w-11 shadow-[0_0_10px_rgba(14,165,233,0.15)]" 
                    src={post.author.image_path} 
                    alt={`${post.author.username}'s profile picture`} 
                    loading="lazy" 
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full shrink-0 border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 flex items-center justify-center font-bold text-lg uppercase shadow-[0_0_10px_rgba(14,165,233,0.15)]">
                    {post.author.username.charAt(0)}
                  </div>
                )}

                {/* Article Content */}
                <div className="grow">
                  
                  {/* Metadata */}
                  <div className="mb-2 flex items-center space-x-2 text-xs font-mono tracking-wider text-slate-400">
                    <Link className="hover:text-cyan-300 transition-colors font-semibold text-cyan-400" href={`/user/${post.author.id}`}>
                      {post.author.username}
                    </Link>
                    <span>&middot;</span>
                    <span>{new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span>&middot;</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                      MEMORY NOTE
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-bold mt-1 mb-2 leading-tight">
                    <Link className="text-white group-hover:text-cyan-300 transition-colors" href={`/post/${post.id}`}>
                      {post.title}
                    </Link>
                  </h2>

                  {/* Content snippet */}
                  <p className="text-slate-300 text-sm leading-relaxed mb-4 line-clamp-3 font-normal">{post.content}</p>

                  <Link href={`/post/${post.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider transition-colors">
                    <span>Read Full Note</span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="glass-panel p-8 text-center rounded-xl border border-slate-800">
            <p className="text-slate-400 italic text-sm">No institutional discussion posts found.</p>
          </div>
        )}
      </div>

      {hasMore && (
        <div className="text-center mt-8 mb-8">
          <button 
            type="button" 
            onClick={loadMorePosts}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-lg border border-cyan-500/40 text-cyan-300 bg-cyan-950/20 hover:bg-cyan-950/40 font-bold text-xs tracking-wider transition-all uppercase disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(14,165,233,0.1)] hover:shadow-[0_0_20px_rgba(14,165,233,0.25)]"
          >
            {isLoading ? 'LOADING...' : error || 'Load More Posts'}
          </button>
        </div>
      )}
    </>
  );
}
