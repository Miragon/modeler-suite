workspace "Shop" {
    model {
        shop = softwareSystem "Shop"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.shop" "400,0"
            }
        }
    }
}
