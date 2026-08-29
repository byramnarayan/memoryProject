import Link from 'next/link';
import { Post, PaginatedPostsResponse } from '@/types';
import { apiFetch } from '@/lib/api';
import PostList from '@/components/PostList';

async function getPosts(): Promise<PaginatedPostsResponse> {
  try {
    type ApiPost = Omit<Post, 'created_at'> & { date_posted?: string };
    type ApiPaginatedResponse = Omit<PaginatedPostsResponse, 'posts'> & { posts: ApiPost[] };
    
    const res = await apiFetch<ApiPaginatedResponse>('/api/posts?skip=0&limit=10', { skipAuth: true, cache: 'no-store' });
    
    const mappedPosts = res.posts.map(p => ({
      ...p,
      created_at: p.date_posted || (p as unknown as Post).created_at
    })) as Post[];
    
    return { ...res, posts: mappedPosts };
  } catch (error) {
    return { posts: [], total: 0, skip: 0, limit: 10, has_more: false };
  }
}

export default async function Home() {
  const paginatedData = await getPosts();

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8">
      {/* GACM Graph Explorer Hero Banner */}
      <div className="bg-navy border border-gold/40 rounded-none p-8 mb-8 text-center text-white shadow-xl">
        <h2 className="text-3xl font-extrabold text-gold tracking-tight mb-2">
          Graph-Augmented Institutional Knowledge Base (GACM)
        </h2>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto mb-6">
          Explore deduplicated faculty research, PageRank expert rankings, SPOF knowledge decay risks, and Louvain interdisciplinary community clusters powered by Memgraph and PostgreSQL Vector Search.
        </p>
        <Link
          href="/gacm"
          className="inline-block bg-gold text-navy hover:bg-yellow-400 px-8 py-3 font-extrabold text-sm uppercase tracking-wider transition-colors"
        >
          Launch Interactive Graph Explorer →
        </Link>
      </div>

      <PostList initialData={paginatedData} apiEndpoint="/api/posts" />

      {/* Newsletter Capture */}
      <div className="bg-cream border border-brand rounded-none p-8 mt-12 text-center">
        <h3 className="text-2xl font-bold font-heading text-ink mb-2">Join the Community</h3>
        <p className="text-muted-grey mb-6">Get a weekly roundup of the top news, guides, and resources.</p>
        <form className="flex flex-col sm:flex-row justify-center max-w-md mx-auto gap-2">
          <input 
            type="email" 
            placeholder="Your email address"
            className="flex-grow text-sm border border-brand px-4 py-3 focus:outline-none focus:border-ink rounded-none bg-white" 
          />
          <button 
            type="button"
            className="bg-gold text-navy hover:bg-yellow-400 px-6 py-3 rounded-none font-bold text-sm tracking-wide transition-colors whitespace-nowrap cursor-pointer"
          >
            SUBSCRIBE
          </button>
        </form>
      </div>
    </div>
  );
}
