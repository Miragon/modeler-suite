workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemLandscape "Base" {
            include *
            autoLayout
        }
        filtered "Base" include "Element" "Filtered"
    }
}
