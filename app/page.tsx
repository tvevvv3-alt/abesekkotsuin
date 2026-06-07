import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ProblemCards from "@/components/sections/ProblemCards";
import PhilosophyCards from "@/components/sections/PhilosophyCards";
import TechCards from "@/components/sections/TechCards";
import TrainerSection from "@/components/sections/TrainerSection";
import StaffCards from "@/components/sections/StaffCards";
import MenuCards from "@/components/sections/MenuCards";
import AccessSection from "@/components/sections/AccessSection";
import FixedLine from "@/components/FixedLine";
import Footer from "@/components/Footer";

function Divider() {
  return <div className="mx-5 my-1 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />;
}

export default function Home() {
  return (
    <>
      <Header />
      <main className="pb-28 bg-navy-dark">
        <section id="hero">
          <HeroSection />
        </section>

        <Divider />
        <section id="problem">
          <ProblemCards />
        </section>

        <Divider />
        <section id="philosophy">
          <PhilosophyCards />
        </section>

        <Divider />
        <section id="approach">
          <TechCards />
        </section>

        <Divider />
        <TrainerSection />

        <Divider />
        <section id="staff">
          <StaffCards />
        </section>

        <Divider />
        <section id="menu">
          <MenuCards />
        </section>

        <Divider />
        <section id="access">
          <AccessSection />
        </section>

        {/* Final CTA */}
        <div className="px-7 pt-12 pb-6 text-center">
          <p className="font-serif text-ink/30 text-xs tracking-widest mb-2">
            完全予約制 · LINE 24時間受付
          </p>
        </div>

        <Footer />
      </main>
      <FixedLine />
    </>
  );
}
