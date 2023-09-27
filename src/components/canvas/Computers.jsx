/* eslint-disable react/no-unknown-property */
import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF } from '@react-three/drei';
import CanvasLoader from '../Loader'
import PropTypes from 'prop-types';

const Computers = ({ isMobile }) => {
  const computer = useGLTF('./Wizard Tower.glb');

  return (
    <mesh>
      {/*Lighting*/}
      <hemisphereLight intensity={3} groundColor="black" />
      <spotLight 
        intensity={1000} 
        position={[10, 10, 10]} 
        angle={0.15} 
        penumbra={1} />
      <pointLight intensity={1} />

      {/* Wrapper mesh/group to change rotation origin */}
      <group position={[0, 0, 7]}> 
        {/*model*/}
        <primitive 
          object={computer.scene}
          scale={isMobile ? 0.7 : 1.75} 
          position={isMobile ? [0, -3, -2.2] : [0, -0.45, -6.5]}
          rotation={[0, 1.75, 0]}
        />
      </group>
    </mesh>
  );
};

Computers.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

const ComputersCanvas = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    //screen size listener
    const mediaQuery = window.matchMedia('(max-width:500px)');

    //set initial value
    setIsMobile(mediaQuery.matches);

    //media query change handler
    const handleMediaQueryChange = (event) => {
      setIsMobile(event.matches);
    }

    //media query change listener
    mediaQuery.addEventListener('change', handleMediaQueryChange);

    //remove listener when component is removed
    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
    }
  }, [])

  return (
    <Canvas 
      frameloop='demand'
      shadows
      camera={{ position: [20, 3, 5], fov: 25}}
      gl={{ preserveDrawingBuffer: true }}
      >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls
          autoRotate
          autoRotateSpeed={1}
          makeDefault 
          enableZoom={false} 
          maxPolarAngle={Math.PI/2}
          minPolarAngle={Math.PI/2}
        />
        <Computers isMobile={isMobile} />
      </Suspense>
      <Preload all />
    </Canvas>
  )
}

export default ComputersCanvas