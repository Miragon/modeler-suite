workspace {
    model {
        user = person "User"
        s = softwareSystem "S" {
            c = container "C" {
                k = component "K"
            }
            d = container "D"
        }
        t = softwareSystem "T" {
            e = container "E"
        }
        user -> k "Uses"
        !impliedRelationships false
        user -> e "Reads"
        !impliedRelationships com.structurizr.model.CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy
        d -> e "Writes"
        c -> e "Writes"
        c -> e "Reads"
        !impliedRelationships true
        k -> t "Notifies"
        user -> s "Different"
    }
    views {
        systemContext s "Context" {
            include *
        }
        container s "Containers" {
            include *
        }
    }
}
