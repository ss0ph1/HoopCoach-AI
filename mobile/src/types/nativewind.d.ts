import "react-native";
import "expo-av";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }

  interface TextProps {
    className?: string;
  }

  interface ImageProps {
    className?: string;
  }

  interface PressableProps {
    className?: string;
  }

  interface TextInputProps {
    className?: string;
  }

  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
}

declare module "expo-av" {
  interface VideoProps {
    className?: string;
  }
}
