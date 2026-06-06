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

export default function Home() {
  return (
    <>
      <Header />
      <main className="pb-24 bg-navy-dark">
        <HeroSection />

        <div className="divider-gold mx-5 my-2" />
        <ProblemCards />

        <div className="divider-gold mx-5 my-2" />
        <PhilosophyCards />

        <div className="divider-gold mx-5 my-2" />
        <TechCards />

        <div className="divider-gold mx-5 my-2" />
        <TrainerSection />

        <div className="divider-gold mx-5 my-2" />
        <StaffCards />

        <div className="divider-gold mx-5 my-2" />
        <MenuCards />

        <div className="divider-gold mx-5 my-2" />
        <AccessSection />

        <Footer />
      </main>
      <FixedLine />
    </>
  );
}
