import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

import { tailwindStyles } from '../style';
import { staggerContainer } from '../utils/motion';

const SectionWrapper = (Component, idName) => { 

    const WrappedComponent = () => {
        const [ref, inView] = useInView({
            triggerOnce: true,
            threshold: 0.25, // This means the animation will start when 25% of the element is in view.
        });

        return (
            <motion.section 
                ref={ref}
                variants={staggerContainer()} 
                initial="hidden"
                animate={inView ? 'show' : 'hidden'}
                className={`${tailwindStyles.padding} max-w-7xl mx-auto relative z-0`}>
                <span className='hash-span' id={idName}>
                    &nbsp;
                </span>
                <Component />
            </motion.section>
        );
    }

    return WrappedComponent;
}

export default SectionWrapper;
