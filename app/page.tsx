import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ProblemCards from "@/components/sections/ProblemCards";
import PhilosophyCards from "@/components/sections/PhilosophyCards";
import EvalSection from "@/components/sections/EvalSection";
import TreatmentSection from "@/components/sections/TreatmentSection";
import RehabSection from "@/components/sections/RehabSection";
import TrunkSection from "@/components/sections/TrunkSection";
import StaffCards from "@/components/sections/StaffCards";
import FacilityCards from "@/components/sections/FacilityCards";
import SportsSection from "@/components/sections/SportsSection";
import MenuCards from "@/components/sections/MenuCards";
import AccessSection from "@/components/sections/AccessSection";
import CTASection from "@/components/CTASection";
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
        {/* ① HERO */}
        <section id="hero">
          <HeroSection />
        </section>

        <Divider />
        {/* ② PROBLEM */}
        <section id="problem">
          <ProblemCards />
        </section>

        <Divider />
        {/* ③ PHILOSOPHY */}
        <section id="philosophy">
          <PhilosophyCards />
        </section>

        <Divider />
        {/* ④ EVALUATION */}
        <section id="evaluation">
          <EvalSection />
        </section>

        <Divider />
        {/* ⑤ TREATMENT */}
        <section id="treatment">
          <TreatmentSection />
        </section>

        <Divider />
        {/* ⑥ REHAB */}
        <section id="rehab">
          <RehabSection />
        </section>

        <Divider />
        {/* ⑦ TRUNK CLASS */}
        <section id="trunk">
          <TrunkSection />
        </section>

        <Divider />
        {/* ⑧ STAFF */}
        <section id="staff">
          <StaffCards />
        </section>

        <Divider />
        {/* ⑨ FACILITY */}
        <section id="facility">
          <FacilityCards />
        </section>

        <Divider />
        {/* ⑩ SPORTS SUPPORT */}
        <section id="sports">
          <SportsSection />
        </section>

        <Divider />
        {/* ⑪ MENU + ACCESS */}
        <section id="menu">
          <MenuCards />
        </section>

        <Divider />
        <section id="access">
          <AccessSection />
        </section>

        <Divider />
        {/* ⑫ CTA */}
        <CTASection />

        <Footer />
      </main>
      <FixedLine />
    </>
  );
}
