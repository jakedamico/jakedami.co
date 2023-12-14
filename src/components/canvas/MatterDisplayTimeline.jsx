import { useEffect, useRef, useState } from 'react';
import { Engine, Render, Bodies, World, Runner, Body } from 'matter-js';

function MatterDisplayTimeline(props) {
  const scene = useRef();
  const containerRef = useRef(); // Ref for the parent container
  const engine = useRef(Engine.create());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    //gravity setting
    engine.current.gravity.y = 0.05;
    // Initial size update
    updateSize();

    // Update size on window resize
    window.addEventListener('resize', updateSize);

    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const { width, height } = dimensions;

    if (width === 0 || height === 0) return;

    const render = Render.create({
      element: scene.current,
      engine: engine.current,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: 'transparent'
      }
    });

    World.add(engine.current.world, []);

    const ballCreationInterval = setInterval(() => {
      const maxRadius = 40; // Maximum possible radius for a ball
      const randomX = Math.random() * (width - 2 * maxRadius) + maxRadius;
      const yPos = height * 0.05;

      createBall(randomX, yPos);
    }, 200);

    Runner.run(engine.current);
    Render.run(render);

    createBodiesForDivs();

    return () => {
      clearInterval(ballCreationInterval);
      Render.stop(render);
      World.clear(engine.current.world);
      Engine.clear(engine.current);
      render.canvas.remove();
      render.canvas = null;
      render.context = null;
      render.textures = {};
    };
  }, [dimensions]);

  const createBodiesForDivs = () => {
   const createdBodiesMap = {}; // Tracks whether a body has been created for each div
 
   const checkAndCreateBodies = () => {
     const divs = document.querySelectorAll('.vertical-timeline-element-content.bounce-in');
     
     let allBodiesCreated = true;
 
     divs.forEach((div, index) => {
       if (!createdBodiesMap[index]) { // Check if the body has not been created for this div
         const rect = div.getBoundingClientRect();
         const canvasRect = scene.current.getBoundingClientRect();
 
         const x = (rect.left - canvasRect.left) + (rect.width / 2);
         const y = (rect.top - canvasRect.top) + (rect.height / 2);
 
         const body = Bodies.rectangle(
           x, y, rect.width, rect.height, { 
             isStatic: true,
             render: {
               fillStyle: 'transparent',
               strokeStyle: 'transparent',
               lineWidth: 0
             }
           }
         );
 
         World.add(engine.current.world, [body]);
         createdBodiesMap[index] = true; // Mark this div's body as created
       } else {
         allBodiesCreated = allBodiesCreated && true;
       }
     });
 
     if (allBodiesCreated && divs.length === 4) {
       clearInterval(intervalId); // Clear interval if all bodies are created
     }
   };
 
   const intervalId = setInterval(checkAndCreateBodies, 500);
 };

  const createBall = (x, y) => {
    const radius = 10 + Math.random() * 10;
    const colors = ['#EE4266', '#8377D1', '#9CC69B', '#79B4A9'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const ball = Bodies.circle(
      x,
      y,
      radius,
      {
        mass: 7,
        density: 0.0005,
        restitution: 0.95,
        friction: 0.005,
        render: {
          fillStyle: randomColor
        }
      }
    );

   World.add(engine.current.world, [ball]);
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    >
      <div ref={scene} style={{ width: '100%', height: '100%' }} />
         <button onClick={createBodiesForDivs}>Create Bodies</button>
    </div>
  );
}

export default MatterDisplayTimeline;