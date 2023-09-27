import { BrowserRouter, Route, Routes } from "react-router-dom"
import { About, Contact, Experience, Hero, Navbar,
        Tech, Works, StarsCanvas, LandingPage } from './components'

//general portfolio encapsulation, dont wanna component it 
const Portfolio = () => {
  return (
    <div className="relative z-0 bg-primary">
      <div className="bg-hero-pattern bg-cover bg-no-repeat bg-center">
        <Navbar />
        <Hero />
      </div>
      <About />
      <Experience />
      <Tech />
      <Works />
      <div className="relative z-0">
        <Contact />
        <StarsCanvas />
      </div>
    </div>
  );
};

const App = () => {
  //site routing system 
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/game" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

