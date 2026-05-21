import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Facilities from "@/pages/Facilities";
import Schedule from "@/pages/Schedule";
import Booking from "@/pages/Booking";
import Admin from "@/pages/Admin";
import About from "@/pages/About";
import Contact from "@/pages/Contact";

const basename = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <div className="flex flex-col min-h-screen">
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route
            path="/*"
            element={
              <>
                <Navbar />
                <main className="flex-1">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/facilities" element={<Facilities />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/booking" element={<Booking />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
                <Footer />
              </>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
