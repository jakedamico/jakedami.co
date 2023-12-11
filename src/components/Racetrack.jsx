import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { useGLTF } from '@react-three/drei';

const Racetrack = () => {

    function SkyCastleLandscape(props) {
        const gltf = useGLTF('/skycastle.glb');
        const [ref] = useBox(() => ({ type: 'Static', ...props })); // 'Static' type ensures it doesn't move
    
        return <primitive ref={ref} object={gltf.scene} />;
    }
    

    function Cube(props) {
        const [ref] = useBox(() => ({ mass: 1, position: [0, 5, 0], ...props }));
        return (
            <mesh ref={ref}>
                <boxGeometry />
            </mesh>
        );
    }

    return (
        <>
            <style>
                {`body, canvas {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    overflow: hidden;
                }`}
            </style>
            <Canvas>
                <Physics>
                    <SkyCastleLandscape />
                    <Cube />
                </Physics>
            </Canvas>
        </>
    );
};







export default Racetrack;
