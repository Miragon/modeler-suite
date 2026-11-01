workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "owner" "team"
                "c4modeler.element.a" "80,0"
            }
        }
    }
}
