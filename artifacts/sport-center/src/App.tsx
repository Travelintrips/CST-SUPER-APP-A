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

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <Routes>
          <Route path="/sport-center/admin" element={<Admin />} />
          <Route
            path="/sport-center/*"
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
                    <Route path="*" element={<Navigate to="/sport-center/" replace />} />
                  </Routes>
                </main>
                <Footer />
              </>
            }
          />
          <Route path="*" element={<Navigate to="/sport-center/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
