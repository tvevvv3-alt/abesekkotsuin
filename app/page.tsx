import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import Philosophy from "@/components/Philosophy";
import Approach from "@/components/Approach";
import Voice from "@/components/Voice";
import Technology from "@/components/Technology";
import Athletes from "@/components/Athletes";
import Staff from "@/components/Staff";
import MenuSection from "@/components/MenuSection";
import Access from "@/components/Access";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problem />
        <Philosophy />
        <Approach />
        <Voice />
        <Technology />
        <Athletes />
        <Staff />
        <MenuSection />
        <Access />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
