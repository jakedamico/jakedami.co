import { useEffect, useRef, useState } from 'react'
import { Engine, Render, Bodies, World, Runner } from 'matter-js'

function MatterDisplay (props) {
  const scene = useRef()
  const containerRef = useRef() // Ref for the parent container
  const engine = useRef(Engine.create())
  const isPressed = useRef(false) // Added this ref for mouse press tracking
  const lastCreated = useRef(Date.now()) // Added this ref for ball creation timing
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

    // Set up Matter.js render with new dimensions
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

    World.add(engine.current.world, [
      Bodies.rectangle(width / 2, -10, width, 20, { isStatic: true }),
      Bodies.rectangle(-10, height / 2, 20, height, { isStatic: true }),
      Bodies.rectangle(width / 2, height + 10, width, 20, { isStatic: true }),
      Bodies.rectangle(width + 10, height / 2, 20, height, { isStatic: true })
    ])

    Runner.run(engine.current)
    Render.run(render)

    return () => {
      Render.stop(render)
      World.clear(engine.current.world)
      Engine.clear(engine.current)
      render.canvas.remove()
      render.canvas = null
      render.context = null
      render.textures = {}
    }
  }, [dimensions])

  const handleDown = () => {
    isPressed.current = true
  }

  const handleUp = () => {
    isPressed.current = false
  }

  const handleAddCircle = e => {
   const colors = ['#EE4266', '#8377D1', '#9CC69B', '#79B4A9'];
    if (isPressed.current && Date.now() - lastCreated.current > 200) {
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const ball = Bodies.circle(
        e.clientX,
        e.clientY,
        10 + Math.random() * 30,
        {
          mass: 10,
          restitution: 0.9,
          friction: 0.005,
          render: {
            fillStyle: randomColor
          }
        })
      World.add(engine.current.world, [ball])
      lastCreated.current = Date.now();
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDown}
      onMouseUp={handleUp}
      onMouseMove={handleAddCircle}
      style={{ width: '100%', height: '100%' }}
    >
      <div ref={scene} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default MatterDisplay

