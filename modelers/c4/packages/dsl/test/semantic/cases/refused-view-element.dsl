workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
    }
    views {
        systemLandscape "Landscape" {
            include web
        }
    }
}
