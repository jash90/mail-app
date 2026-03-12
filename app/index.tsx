import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function IndexScreen() {
    return (
        <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
            <ActivityIndicator size="large" color="white" />
        </StyledSafeAreaView>
    );
}
