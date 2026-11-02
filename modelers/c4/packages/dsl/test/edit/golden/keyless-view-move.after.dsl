workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemLandscape "SystemLandscape-001" {
            include *
            properties {
                "c4modeler.element.a" "80,40"
            }
        }
    }
}
