import Lenis from 'lenis';
import { useEffect } from 'react';
import { ContactCTA } from '../../components/ContactCTA';
import { CustomerMarquee } from '../../components/CustomerMarquee';
import { FloatingButtons } from '../../components/FloatingButtons';
import { Footer } from '../../components/Footer';
import { Gallery } from '../../components/Gallery';
import { Hero } from '../../components/Hero';
import { Navbar } from '../../components/Navbar';
import { Process } from '../../components/Process';
import { RouteSection } from '../../components/RouteSection';
import { Services } from '../../components/Services';
import { Statistics } from '../../components/Statistics';
import { Testimonials } from '../../components/Testimonials';

export default function LandingPage() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (time: number) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
    });

    let frameId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    };

    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-950 antialiased">
      <Navbar />
      <main>
        <Hero />
        <Services />
        <CustomerMarquee />
        <RouteSection />
        <Statistics />
        <Process />
        <Gallery />
        <Testimonials />
        <ContactCTA />
      </main>
      <Footer />
      <FloatingButtons />
    </div>
  );
}
