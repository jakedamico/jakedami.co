/* eslint-disable react/no-unknown-property */
import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame} from '@react-three/fiber';
import { useGLTF, Points, PointMaterial } from '@react-three/drei';
import { Link } from 'react-router-dom';
import * as random from 'maath/random/dist/maath-random.esm'

//import CanvasLoader from './Loader'

function MoonModel({ url }) {
  const gltf = useGLTF(url);
  const ref = React.useRef();

  //used for rotating moonModel
  useFrame(() => {
    if (ref.current) {
      //adjust for rotation speed, no idea why it needs to be that small
      ref.current.rotation.y += 0.0004;
    }
  });

  return (
    <primitive 
      ref={ref}
      object={gltf.scene} 
      scale={0.35}
      rotation={[0, 0, 0]}
      position={[0, 0.25, 0]}
    />
  );
}

//repeat code, gross!
function Stars() {
  const ref = useRef();

  const sphere = random.inSphere(new Float32Array(5000), { radius: 8})

  useFrame((state, delta) => {
    ref.current.rotation.x += delta / 10;
    //ref.current.rotation.y -= delta / 10;
    //ref.current.rotation.z += delta / 5;
  })

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={sphere} stride={3} frustumCulled>
        <PointMaterial
          transparent
          color="#f272c8"
          size={0.022}
          sizeAttenuation={true}
          depthWrite={false} />
      </Points>
    </group>
  );
}



function LandingPage() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <Canvas>
        <ambientLight />
        <Stars />
        <Suspense fallback={ null }>
          <MoonModel url="space_exploration.glb" />
        </Suspense>
      </Canvas>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
        <h1 className="text-white text-4xl mb-4">Welcome to My Portfolio</h1>
        <div className="flex space-x-4">
          <Link to="/portfolio" className="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded">
            Regular Portfolio
          </Link>
          <Link to="/game" className="bg-green-500 hover:bg-green-700 text-white py-2 px-4 rounded">
            3D Game Experience
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;


