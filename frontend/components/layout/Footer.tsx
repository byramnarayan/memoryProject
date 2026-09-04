import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto py-12 bg-navy text-white">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold font-heading mb-4 text-gold">MnemoGraph</h2>
          <p className="text-white/70 text-sm max-w-sm leading-relaxed">
            Institutional Knowledge Base, Graph-Augmented Collective Memory (GACM), and Academic Research Intelligence.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Sections</h3>
          <ul className="space-y-2 text-white/70 text-sm">
            <li><Link href="/gacm" className="hover:text-gold transition-colors font-semibold text-gold">Graph Explorer</Link></li>
            <li><Link href="/" className="hover:text-gold transition-colors">News & Blog</Link></li>
            <li><Link href="/library" className="hover:text-gold transition-colors">Resource Library</Link></li>
            <li><Link href="/community" className="hover:text-gold transition-colors">Community Forum</Link></li>
            <li><Link href="/submit" className="hover:text-gold transition-colors">Submit Resource</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Legal</h3>
          <ul className="space-y-2 text-white/70 text-sm">
            <li><Link href="/about" className="hover:text-gold transition-colors">About Us</Link></li>
            <li><Link href="/contact" className="hover:text-gold transition-colors">Contact</Link></li>
            <li><Link href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-gold transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 mt-12 pt-8 border-t border-white/10 text-center text-sm text-white/50">
        <p>© {new Date().getFullYear()} MnemoGraph. All rights reserved.</p>
      </div>
    </footer>
  );
}
