import Image from "next/image";
import styles from "./loader.module.css";

function LoaderWithLogo() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <Image
        src="/Loading-Time.png"
        alt="Generating…"
        width={180}
        height={180}
        className="object-cover object-center mx-auto mb-4"
      />
      <p className="text-sm text-gray-500 mb-3">Generating your questions…</p>
      <div className={styles.loader} />
    </div>
  );
}

export default LoaderWithLogo;
