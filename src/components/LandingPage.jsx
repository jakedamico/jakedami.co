import React from 'react';
import { Link } from 'react-router-dom';

function LandingPage() {
  //<Link> used for routing
  return (
    <div className="landing-page">
      <h1>Welcome to My Portfolio</h1>
      <div className="options">
        <Link to="/portfolio">
          <button>Regular Portfolio</button>
        </Link>
        <Link to="/game">
          <button>3D Game Experience</button>
        </Link>
      </div>
    </div>
  );
}

export default LandingPage;
