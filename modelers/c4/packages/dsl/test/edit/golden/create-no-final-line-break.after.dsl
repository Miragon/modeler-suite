workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
    }
    views {
        systemLandscape "L" {
            include *
            properties {
                "c4modeler.element.a" "0,0"
                "c4modeler.element.b" "400,0"
            }
        }
    }
}