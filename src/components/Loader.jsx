import { Html, useProgress } from '@react-three/drei'

const Loader = () => {
  const progressObject = useProgress();

  return (
    <Html>
      <span className='canvas-load'></span>
      <p style={{ fontsize: 14, color: '#f1f1f1', fontWeight: 800,
                  marginTop: 40}}>
        {Number(progressObject.progress).toFixed(2)}%
      </p>
    </Html>
  )
}

export default Loader